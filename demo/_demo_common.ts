// Demo helpers (local-only). Not part of the protocol.
// This file is intentionally allowed to do I/O. Only demo code touches disk.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type AnyObj = Record<string, any>;

const LAST_FILE = join(process.cwd(), "demo", ".demo_last.json");
const EVIDENCE_DIR = join(process.cwd(), "demo", "_evidence");

function ensureEvidenceDir() {
  try {
    if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

export function summarize(out: AnyObj) {
  const g = out?.guardrail ?? {};
  const receipt = g?.receipt ?? {};
  return {
    guardrail_action: g?.action,
    executed: Boolean(g?.executed),
    receipt_id: receipt?.receipt_id,
    plan_hash: receipt?.plan_hash,
    confirmation: g?.confirmation ?? null,
    reason: g?.reason ?? out?.policy?.reason ?? null,
  };
}

export function printHeader(title: string) {
  const line = "─".repeat(Math.max(10, title.length));
  console.log(`${title}\n${line}`);
}

export function printJson(label: string, obj: unknown) {
  console.log(`\n# ${label}`);
  console.log(JSON.stringify(obj, null, 2));
}

export function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

/**
 * A baseline signals payload.
 * Demo 1 auto-searches a nearby value to land on REQUIRE_CONFIRM (not BLOCK).
 */
export const BASE_SIGNALS = {
  files_touched: 8, // tuned to REQUIRE_CONFIRM in typical policies
  files_touched_per_change_median: 6,
  lines_added: 900,
  active_duration_ms: 3 * 60 * 60 * 1000, // 3h
  input_source: "demo",
  active_goal: "large refactor / architectural change",
  touched_paths: ["src/", "docs/", "package.json"],
  diff_lines_total: 900,
  touches_package_json: true,
  touches_lockfile: true,
} as const;

export function withFilesTouched(n: number) {
  return { ...(BASE_SIGNALS as any), files_touched: n };
}

/**
 * Demo-only persistence: store the exact signals used to mint a receipt.
 * This prevents accidental plan_hash drift between demo steps.
 */
export function writeLastRun(payload: any) {
  try {
    writeFileSync(LAST_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    // ignore
  }
}

export function readLastRun(): any | null {
  try {
    if (!existsSync(LAST_FILE)) return null;
    return JSON.parse(readFileSync(LAST_FILE, "utf8"));
  } catch {
    return null;
  }
}

export function writeEvidence(step: string, payload: any) {
  ensureEvidenceDir();
  try {
    const file = join(EVIDENCE_DIR, `${step}.json`);
    writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
    return file;
  } catch {
    return null;
  }
}
