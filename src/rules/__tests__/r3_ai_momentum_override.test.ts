import test from "node:test";
import assert from "node:assert/strict";
import { r3_ai_momentum_override } from "../r3_ai_momentum_override.js";

const expectedBoundary = {
  timebox_minutes: 20,
  max_files: 2,
  forbid_new_deps: true,
  forbid_protected_paths: false,
} as const;

test("weak intent + high files => hit", () => {
  const result = r3_ai_momentum_override.evaluate({
    intent: "refactor",
    signals: {
      files_touched: 10,
      diff_lines_total: 0,
      new_files: 0,
      touches_package_json: false,
      touches_lockfile: false,
      touched_paths: [],
    },
  });

  assert.equal(result.hit, true);
  assert.equal(result.verdict, "REQUIRE_CONFIRM");
  assert.deepEqual(result.boundary, expectedBoundary);
  assert(result.reasons.some((r) => r.includes("weak_intent")));
  assert(result.reasons.some((r) => r.includes("amplification_high")));
});

test("strong intent + high files => no hit", () => {
  const result = r3_ai_momentum_override.evaluate({
    intent: "Update src/server.ts to validate receipt confirmation flow",
    signals: {
      files_touched: 12,
      diff_lines_total: 0,
      new_files: 0,
      touches_package_json: false,
      touches_lockfile: false,
      touched_paths: ["src/server.ts"],
    },
  });

  assert.equal(result.hit, false);
  assert.equal(result.verdict, "ALLOW");
});

test("weak intent + dependency change => hit", () => {
  const result = r3_ai_momentum_override.evaluate({
    intent: "cleanup",
    signals: {
      files_touched: 1,
      diff_lines_total: 12,
      new_files: 0,
      touches_package_json: true,
      touches_lockfile: false,
      touched_paths: [],
    },
  });

  assert.equal(result.hit, true);
  assert.equal(result.verdict, "REQUIRE_CONFIRM");
  assert.deepEqual(result.boundary, expectedBoundary);
  assert(result.reasons.some((r) => r.includes("boundary_cross")));
});

test("weak intent + low change => no hit", () => {
  const result = r3_ai_momentum_override.evaluate({
    intent: "quick fix",
    signals: {
      files_touched: 1,
      diff_lines_total: 10,
      new_files: 0,
      touches_package_json: false,
      touches_lockfile: false,
      touched_paths: ["src/index.ts"],
    },
  });

  assert.equal(result.hit, false);
  assert.equal(result.verdict, "ALLOW");
});
