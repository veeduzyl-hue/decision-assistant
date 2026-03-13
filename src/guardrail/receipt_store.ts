// src/guardrail/receipt_store.ts
//
// Receipt lifecycle authority (server runtime) + local evidence log (append-only JSONL).
// MUST match docs/receipt_semantics.md (v0.2+):
// - receipt authority is server-side
// - JSONL is evidence only (MUST NOT be used to reconstruct or infer state)
//
// Line format (one event per line):
// {
//   "ts": "ISO-8601",
//   "action": "issue" | "consume",
//   "receipt_id": "...",
//   "plan_hash": "...",
//   "scope": "this_call_only"
// }

import { existsSync, mkdirSync, appendFileSync } from "node:fs";
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
 * Server-authoritative in-memory lifecycle state.
 * This Map is the ONLY source for getReceiptState().
 *
 * NOTE:
 * - This is per-process runtime state (not persisted).
 * - JSONL is evidence only; do NOT read it to infer state.
 */
const receiptState = new Map<string, { status: "active" | "consumed"; plan_hash: string; scope: ReceiptScope }>();

/**
 * Issue a receipt.
 * Server MUST call this when returning guardrail.action=REQUIRE_CONFIRM.
 */
export function issueReceipt(r: ReceiptRecord): void {
  if (!r?.receipt_id || !r?.plan_hash) return;

  const scope: ReceiptScope = r.scope ?? "this_call_only";

  // Authoritative state update
  receiptState.set(r.receipt_id, {
    status: "active",
    plan_hash: r.plan_hash,
    scope,
  });

  // Evidence append
  appendEvent({
    ts: nowIso(),
    action: "issue",
    receipt_id: r.receipt_id,
    plan_hash: r.plan_hash,
    scope,
  });
}

/**
 * Consume a receipt.
 * Server MUST call this when accepting confirm: { mode:"EXECUTE", ... }.
 *
 * This operation is monotonic: active -> consumed, and consumed stays consumed.
 * No additional lifecycle states are introduced.
 */
export function consumeReceipt(
  receipt_id: string,
  plan_hash: string,
  scope: ReceiptScope = "this_call_only"
): void {
  if (!receipt_id || !plan_hash) return;

  const existing = receiptState.get(receipt_id);

  // Authoritative state update (monotonic)
  receiptState.set(receipt_id, {
    status: "consumed",
    plan_hash: existing?.plan_hash ?? plan_hash,
    scope: existing?.scope ?? scope,
  });

  // Evidence append
  appendEvent({
    ts: nowIso(),
    action: "consume",
    receipt_id,
    plan_hash,
    scope,
  });
}

/**
 * Returns the current lifecycle state for a receipt_id.
 *
 * IMPORTANT:
 * This function MUST NOT read local logs/files.
 * JSONL is evidence only and MUST NOT be used to infer lifecycle.
 */
export function getReceiptState(receipt_id: string): ReceiptState {
  if (!receipt_id) return { status: "missing" };

  const s = receiptState.get(receipt_id);
  if (!s) return { status: "missing" };

  if (s.status === "active") return { status: "active", plan_hash: s.plan_hash, scope: s.scope };
  return { status: "consumed", plan_hash: s.plan_hash, scope: s.scope };
}

/**
 * Find one active receipt for the same computed plan_hash.
 * Used to avoid issuing duplicate active receipts for identical plans.
 */
export function findActiveReceiptByPlanHash(
  plan_hash: string
): { receipt_id: string; plan_hash: string; scope: ReceiptScope } | null {
  if (!plan_hash) return null;

  for (const [receipt_id, state] of receiptState.entries()) {
    if (state.status === "active" && state.plan_hash === plan_hash) {
      return { receipt_id, plan_hash: state.plan_hash, scope: state.scope };
    }
  }
  return null;
}
