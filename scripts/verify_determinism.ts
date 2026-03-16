import assert from "node:assert/strict";

import { loadConfig } from "../src/config/loadConfig.js";
import { assess } from "../src/modules/assess/assess.js";

function stableClone(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableClone(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "receipt_id" && key !== "nonce" && key !== "ack_receipt_id")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableClone(child)]);
    return Object.fromEntries(entries);
  }

  return value;
}

function assertDeterministic(label: string, samples: unknown[]): void {
  const baseline = JSON.stringify(stableClone(samples[0]));
  for (const sample of samples.slice(1)) {
    assert.equal(JSON.stringify(stableClone(sample)), baseline, `${label} must be deterministic`);
  }
}

function main(): void {
  const config = loadConfig();

  const allowSignals = {
    files_touched: 1,
    diff_lines_total: 10,
    touches_package_json: false,
    touches_lockfile: false,
    ship_gap_days: 0,
    refactor_commits_ratio: 0,
    todo_growth_ratio: 0,
    churn_ratio: 0,
  };

  const allowRuns = Array.from({ length: 3 }, () => assess({ config, signals: allowSignals }));
  assertDeterministic("ALLOW assessment", allowRuns);
  assert.equal(allowRuns[0]?.guardrail.action, "ALLOW");

  const confirmSignals = {
    files_touched: 10,
    diff_lines_total: 100,
    touches_package_json: false,
    touches_lockfile: false,
    ship_gap_days: 0,
    refactor_commits_ratio: 0,
    todo_growth_ratio: 0,
    churn_ratio: 0,
  };

  const requireConfirmRuns = Array.from({ length: 3 }, () => assess({ config, signals: confirmSignals }));
  assertDeterministic("REQUIRE_CONFIRM assessment", requireConfirmRuns);
  assert.equal(requireConfirmRuns[0]?.guardrail.action, "REQUIRE_CONFIRM");

  const planHash = requireConfirmRuns[0]?.guardrail.receipt?.plan_hash;
  assert.equal(typeof planHash, "string", "REQUIRE_CONFIRM must compute a plan_hash");

  const executeRuns = Array.from({ length: 3 }, () =>
    assess({
      config,
      signals: confirmSignals,
      confirm: {
        mode: "EXECUTE",
        receipt_id: "gr_deterministic0001",
        plan_hash: planHash as string,
        nonce: "nonce_deterministic0001",
      },
    })
  );

  assertDeterministic("EXECUTE assessment", executeRuns);
  assert.equal(executeRuns[0]?.guardrail.action, "ALLOW");
  assert.equal(executeRuns[0]?.guardrail.executed, true);

  console.log("[verify:determinism] OK");
}

main();
