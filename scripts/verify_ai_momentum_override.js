import assert from "node:assert/strict";
import { defaultConfig } from "../dist/config/defaults.js";
import { evaluateAiMomentumOverride } from "../dist/rules/r3_ai_momentum_override.js";

function expectHit(label, signals) {
  const out = evaluateAiMomentumOverride(defaultConfig, signals);
  assert.equal(out.hit, true, `${label}: expected hit=true`);
  assert(out.reasons.length > 0, `${label}: expected reasons to be non-empty`);
}

function expectMiss(label, signals) {
  const out = evaluateAiMomentumOverride(defaultConfig, signals);
  assert.equal(out.hit, false, `${label}: expected hit=false`);
}

expectHit("files_high_lines_high", {
  files_touched: 8,
  diff_lines_total: 400,
});

expectHit("files_high_dep_true", {
  files_touched: 9,
  diff_lines_total: 10,
  touches_package_json: true,
});

expectMiss("files_low_no_hit", {
  files_touched: 3,
  diff_lines_total: 800,
  touches_lockfile: true,
});

console.log("[smoke:ai_momentum_override] OK");
