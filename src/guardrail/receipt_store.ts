// src/guardrail/receipt_store.ts
//
// Receipt store (local-only, append-only JSONL)
// MUST match docs/receipt_semantics.md (v0.2)
//
// Line format (one event per line):
// {
//   "ts": "ISO-8601",
//   "action": "issue" | "consume",
//   "receipt_id": "...",
//   "plan_hash": "...",
//   "scope": "this_call_only"
// }

import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ReceiptScope = "this_call_only";

export type ReceiptRecord = {
  receipt_id: string;
  plan_hash: string;
  scope: ReceiptScope;
};

export type ReceiptEvent = {
  ts: string; // ISO-8601
  action: "issue" | "consume";
  receipt_id: string;
  plan_hash: string;
  scope: ReceiptScope;
};

export type ReceiptState =
  | { status: "missing" }
  | { status: "active"; plan_hash: string; scope: ReceiptScope }
  | { status: "consumed"; plan_hash: string; scope: ReceiptScope };

const STORE_DIR = join(homedir(), ".decision-assistant");
const STORE_FILE = join(STORE_DIR, "receipts.jsonl");

function ensureStoreDir(): void {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
}

function nowIso(): string {
  return new Date().toISOString();
}

function appendEvent(ev: ReceiptEvent): void {
  ensureStoreDir();
  appendFileSync(STORE_FILE, JSON.stringify(ev) + "\n", { encoding: "utf8" });
}

/**
 * Issue a receipt (append-only).
 * Server MUST call this when returning guardrail.action=REQUIRE_CONFIRM.
 */
export function issueReceipt(r: ReceiptRecord): void {
  if (!r?.receipt_id || !r?.plan_hash) return;
  appendEvent({
    ts: nowIso(),
    action: "issue",
    receipt_id: r.receipt_id,
    plan_hash: r.plan_hash,
    scope: r.scope ?? "this_call_only",
  });
}

/**
 * Consume a receipt (append-only).
 * Server MUST call this exactly once when accepting confirm: { mode:"EXECUTE", ... }.
 */
export function consumeReceipt(receipt_id: string, plan_hash: string, scope: ReceiptScope = "this_call_only"): void {
  if (!receipt_id || !plan_hash) return;
  appendEvent({
    ts: nowIso(),
    action: "consume",
    receipt_id,
    plan_hash,
    scope,
  });
}

/**
 * Returns the current state for a receipt_id based on the append-only log.
 *
 * Semantics (docs-aligned):
 * - missing: receipt_id never issued
 * - active: last relevant event is "issue"
 * - consumed: last relevant event is "consume"
 *
 * Note: we track the LAST event for the receipt_id (event-sourced).
 */
export function getReceiptState(receipt_id: string): ReceiptState {
  if (!receipt_id) return { status: "missing" };
  if (!existsSync(STORE_FILE)) return { status: "missing" };

  let last: ReceiptEvent | null = null;

  try {
    const raw = readFileSync(STORE_FILE, "utf8");
    const lines = raw.split(/\r?\n/);

    for (const line of lines) {
      const s = line.trim();
      if (!s) continue;

      let ev: any;
      try {
        ev = JSON.parse(s);
      } catch {
        continue; // ignore malformed lines
      }

      if (!ev || ev.receipt_id !== receipt_id) continue;
      if (ev.action !== "issue" && ev.action !== "consume") continue;
      if (typeof ev.plan_hash !== "string") continue;

      // Normalize scope to v0.2 default if absent / invalid
      const scope: ReceiptScope = ev.scope === "this_call_only" ? "this_call_only" : "this_call_only";

      last = {
        ts: typeof ev.ts === "string" ? ev.ts : nowIso(),
        action: ev.action,
        receipt_id: ev.receipt_id,
        plan_hash: ev.plan_hash,
        scope,
      };
    }
  } catch {
    return { status: "missing" };
  }

  if (!last) return { status: "missing" };

  if (last.action === "issue") {
    return { status: "active", plan_hash: last.plan_hash, scope: last.scope };
  }
  return { status: "consumed", plan_hash: last.plan_hash, scope: last.scope };
}
