import type { DecisionSignal } from "../infra/types/signal.js";
import type { AppConfig } from "../config/defaults.js";
import { r3_ai_momentum_override } from "./r3_ai_momentum_override.js";

export type ReasonsMap = {
  default: string;
  cold?: string;
  brutal?: string;
};

export type ColdRuleHit = {
  hit: true;
  rule_id: string;
  reasons: ReasonsMap;
};

export type ColdRuleMiss = { hit: false };

export type ColdRuleResult = ColdRuleHit | ColdRuleMiss;

// ---- helpers ----
function num(signals: DecisionSignal[], kind: string, fallback = 0): number {
  const v = signals.find((s) => s.kind === kind)?.value;
  return typeof v === "number" ? v : fallback;
}
function str(signals: DecisionSignal[], kind: string, fallback = ""): string {
  const v = signals.find((s) => s.kind === kind)?.value;
  return typeof v === "string" ? v : fallback;
}
function strArr(signals: DecisionSignal[], kind: string): string[] {
  const v = signals.find((s) => s.kind === kind)?.value;
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}
function bool(signals: DecisionSignal[], kind: string, fallback = false): boolean {
  const v = signals.find((s) => s.kind === kind)?.value;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v > 0;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return fallback;
}

/**
 * Phase 1 Cold Rules Aggregator (v1.0)
 * - cold-first
 * - single-hit
 * - deterministic
 *
 * NOTE: Phase 1 only returns ONE hit (first match). No stacking.
 */
export function evaluateColdRules(signals: DecisionSignal[], config: AppConfig): ColdRuleResult {
  // R1: Refactor / Change amplification via files_touched (已有配置阈值)
  const filesTouched = num(signals, "files_touched", 0);
  const { warn, block } = config.guardrail.files_touched;

  if (filesTouched >= block) {
    return {
      hit: true,
      rule_id: "r1_refactor_or_amplification_hard",
      reasons: {
        default: `Hard threshold exceeded: this change touches ${filesTouched} files (>= ${block}).`,
      },
    };
  }

  if (filesTouched >= warn) {
    return {
      hit: true,
      rule_id: "r1_refactor_or_amplification_warn",
      reasons: {
        default: `Warning threshold exceeded: this change touches ${filesTouched} files (>= ${warn}).`,
      },
    };
  }

  // R2: Change amplification spike (requires signal: files_touched_per_change_median)
  const ftMedian = num(signals, "files_touched_per_change_median", 0);
  if (ftMedian >= 6) {
    return {
      hit: true,
      rule_id: "r2_change_amplification_spike",
      reasons: {
        default: `Change amplification spike: median files touched per change is ${ftMedian} (>= 6).`,
      },
    };
  }

  const touchedPaths = strArr(signals, "touched_paths");

  // R3: AI momentum override (weak intent + amplification/boundary)
  const intent = str(signals, "active_goal") || str(signals, "defined_goal");
  const diffLinesTotal = num(signals, "diff_lines_total", 0);
  const newFiles = num(signals, "new_files", 0);

  const aiMomentum = r3_ai_momentum_override.evaluate({
    intent,
    signals: {
      files_touched: filesTouched,
      diff_lines_total: diffLinesTotal,
      new_files: newFiles,
      touches_package_json: bool(signals, "touches_package_json", false),
      touches_lockfile: bool(signals, "touches_lockfile", false),
      touched_paths: touchedPaths,
    },
  });

  if (aiMomentum.hit) {
    const boundary = aiMomentum.boundary;
    const boundaryText = `Boundary: timebox=${boundary.timebox_minutes}m; max_files=${boundary.max_files}; forbid_new_deps=${boundary.forbid_new_deps}; forbid_protected_paths=${boundary.forbid_protected_paths}.`;
    const reasonsText = aiMomentum.reasons.length
      ? aiMomentum.reasons.join("; ")
      : "weak_intent + amplification_or_boundary";
    return {
      hit: true,
      rule_id: aiMomentum.rule_id,
      reasons: {
        default: `AI momentum override: ${reasonsText}. ${boundaryText}`,
      },
    };
  }

  // proxy: large injection in short time
  // signals:
  // - input_source: "ai_generated" | "manual"
  // - lines_added: number
  // - active_duration_ms: number
  const source = str(signals, "input_source", "manual");
  const linesAdded = num(signals, "lines_added", 0);
  const activeMs = num(signals, "active_duration_ms", 0);
  if (linesAdded >= 200 && activeMs > 0 && activeMs <= 5 * 60 * 1000) {
    return {
      hit: true,
      rule_id: "r3_momentum_override_proxy",
      reasons: {
        default: `High-velocity injection: added ${linesAdded} lines within ${Math.round(activeMs / 1000)}s (>= 200 lines in <= 5min).`,
      },
    };
  }

  // R4: Goal drift (minimal path-based drift)
  // signals:
  // - active_goal / defined_goal: string
  // - touched_paths: string[]
  const goalRaw = str(signals, "active_goal") || str(signals, "defined_goal");
  const goal = goalRaw.toLowerCase();

  if (goal && touchedPaths.length) {
    const touchesSrc = touchedPaths.some((p) => p.startsWith("src/"));
    const touchesDocs = touchedPaths.some((p) => p.startsWith("docs/"));

    // Goal says docs/release, but touches src/
    if ((goal.includes("doc") || goal.includes("readme") || goal.includes("release")) && touchesSrc) {
      return {
        hit: true,
        rule_id: "r4_goal_drift",
        reasons: {
          default: `Goal drift: goal="${goalRaw}" suggests docs/release work, but changed code paths under src/.`,
        },
      };
    }

    // Goal says feature/bug work, but touches docs/
    if ((goal.includes("feature") || goal.includes("implement") || goal.includes("bug")) && touchesDocs) {
      return {
        hit: true,
        rule_id: "r4_goal_drift",
        reasons: {
          default: `Goal drift: goal="${goalRaw}" suggests code work, but changes are concentrated under docs/.`,
        },
      };
    }
  }

  return { hit: false };
}
