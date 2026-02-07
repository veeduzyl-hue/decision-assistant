import { assess } from "../src/tools/assess.js";
import { loadConfig } from "../src/config/loadConfig.js";
import { printHeader, printJson, summarize, getArg, readLastRun, writeEvidence } from "./_demo_common.js";

printHeader("DEMO 3/3 — EXECUTE rejected (stale plan_hash)");

const config = loadConfig();

const argReceiptId = getArg("--receipt_id");
const argPlanHash = getArg("--plan_hash");

const last = readLastRun();
const receipt_id = argReceiptId ?? last?.receipt_id;
const plan_hash = argPlanHash ?? last?.plan_hash;
const baseSignals = last?.signals;

if (!receipt_id || !plan_hash || !baseSignals) {
  console.error("[demo] Missing receipt_id/plan_hash/signals. Run demo_require_confirm.ts first.");
  process.exit(2);
}

// force plan drift (change signals → new plan hash expected)
const mutatedSignals = {
  ...baseSignals,
  lines_added: Number(baseSignals.lines_added ?? 0) + 123,
  touched_paths: [...(baseSignals.touched_paths ?? []), "src/extra_demo_path.ts"],
};

const out = assess({
  config,
  signals: mutatedSignals,
  confirm: { mode: "EXECUTE", receipt_id, plan_hash }, // stale plan_hash on purpose
} as any);

const s = summarize(out);

printJson("signals_used", mutatedSignals);
printJson("summary", s);
printJson("full_decision_payload", out);

if (s.guardrail_action !== "REQUIRE_CONFIRM" || s.executed) {
  console.error("[demo] Expected REQUIRE_CONFIRM + executed:false when plan_hash is stale.");
  process.exit(2);
}
if (!s.confirmation?.rejected) {
  console.error("[demo] Expected confirmation.rejected=true.");
  process.exit(2);
}
if (s.receipt_id === receipt_id) {
  console.error("[demo] Expected a NEW receipt_id to be issued after rejection.");
  process.exit(2);
}

writeEvidence("3_reject", {
  version: "v0.3d",
  step: "reject_stale",
  ts: new Date().toISOString(),
  provided: { receipt_id, plan_hash },
  summary: s,
  full_decision_payload: out,
});

console.log("\n[demo] PASS: stale EXECUTE was rejected and a new receipt was issued.");
