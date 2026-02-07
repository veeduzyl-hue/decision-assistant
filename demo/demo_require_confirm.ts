import { assess } from "../src/tools/assess.js";
import { loadConfig } from "../src/config/loadConfig.js";
import {
  printHeader,
  printJson,
  summarize,
  withFilesTouched,
  BASE_SIGNALS,
  writeLastRun,
  writeEvidence,
} from "./_demo_common.js";

printHeader("DEMO 1/3 — REQUIRE_CONFIRM (issue receipt)");

const config = loadConfig();

/**
 * Auto-search strategy:
 * - Try a descending range for files_touched to avoid hard BLOCK thresholds.
 */
const CANDIDATES = [25, 20, 18, 16, 14, 12, 10, 9, 8, 7, 6, 5];

let out: any = null;
let usedFilesTouched: number | null = null;
let evidenceFile: string | null = null;

for (const ft of CANDIDATES) {
  const candidateSignals = withFilesTouched(ft);
  const r = assess({ config, signals: candidateSignals as any });
  const s = summarize(r);

  if (s.guardrail_action === "REQUIRE_CONFIRM") {
    out = r;
    usedFilesTouched = ft;

    writeLastRun({
      minted_at: new Date().toISOString(),
      signals: candidateSignals,
      receipt_id: s.receipt_id,
      plan_hash: s.plan_hash,
    });

    evidenceFile = writeEvidence("1_require_confirm", {
      version: "v0.3d",
      step: "require_confirm",
      minted_at: new Date().toISOString(),
      summary: s,
      full_decision_payload: r,
    });

    break;
  }
}

if (!out) {
  const lastFt = CANDIDATES[CANDIDATES.length - 1];
  const r = assess({ config, signals: withFilesTouched(lastFt) as any });
  printJson("summary", summarize(r));
  printJson("full_decision_payload", r);

  console.error("\n[demo] Could not reach REQUIRE_CONFIRM in candidate range.");
  console.error("[demo] Your policy may BLOCK or ALLOW for all tested inputs.");
  console.error("[demo] Tuning knobs: demo/_demo_common.ts (BASE_SIGNALS) and CANDIDATES in demo_require_confirm.ts");
  process.exit(2);
}

const s = summarize(out);

printJson("policy_hint", {
  baseline: BASE_SIGNALS,
  evidence: evidenceFile ?? "demo/_evidence/1_require_confirm.json",
  persisted_last: "demo/.demo_last.json",
});
printJson("summary", s);
printJson("full_decision_payload", out);

if (!s.receipt_id || !s.plan_hash) {
  console.error("\n[demo] Missing receipt_id/plan_hash in guardrail.receipt.");
  process.exit(2);
}

console.log("\n[demo] PASS: REQUIRE_CONFIRM issued; receipt_id+plan_hash present.");
console.log(
  "\n# Next step:\n" +
    `npx tsx demo/demo_execute.ts --receipt_id ${s.receipt_id} --plan_hash ${s.plan_hash}\n` +
    `npx tsx demo/demo_reject.ts  --receipt_id ${s.receipt_id} --plan_hash ${s.plan_hash}\n`
);
