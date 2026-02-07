import { assess } from "../src/tools/assess.js";
import { loadConfig } from "../src/config/loadConfig.js";
import { printHeader, printJson, summarize, getArg, readLastRun, writeEvidence } from "./_demo_common.js";

printHeader("DEMO 2/3 — EXECUTE (success path)");

const config = loadConfig();

const argReceiptId = getArg("--receipt_id");
const argPlanHash = getArg("--plan_hash");

const last = readLastRun();
const receipt_id = argReceiptId ?? last?.receipt_id;
const plan_hash = argPlanHash ?? last?.plan_hash;
const signals = last?.signals;

if (!receipt_id || !plan_hash || !signals) {
  console.error("[demo] Missing receipt_id/plan_hash/signals. Run demo_require_confirm.ts first.");
  process.exit(2);
}

const out = assess({
  config,
  signals,
  confirm: { mode: "EXECUTE", receipt_id, plan_hash },
} as any);

const s = summarize(out);

printJson("signals_used", signals);
printJson("summary", s);
printJson("full_decision_payload", out);

if (s.guardrail_action !== "ALLOW" || !s.executed) {
  console.error("[demo] Expected ALLOW + executed:true after EXECUTE.");
  process.exit(2);
}
if (s.receipt_id !== receipt_id) {
  console.error("[demo] receipt_id must be reused (no re-issuance).");
  process.exit(2);
}

writeEvidence("2_execute", {
  version: "v0.3d",
  step: "execute",
  ts: new Date().toISOString(),
  summary: s,
  full_decision_payload: out,
});

console.log("\n[demo] PASS: EXECUTE accepted; receipt_id reused (no re-issuance).");
