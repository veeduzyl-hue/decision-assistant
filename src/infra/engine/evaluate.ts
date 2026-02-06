import type { DecisionSignal } from "../types/signal.js";
import type { PolicyDecision } from "../types/policy.js";
import type { AppConfig } from "../../config/defaults.js";
import type { TriggerSignals } from "../../rules/refactor_time_black_hole.js";
import { evaluateColdRules } from "../../rules/cooldown.js";
import { evaluateAiMomentumOverride } from "../../rules/r3_ai_momentum_override.js";
import { evaluateRefactorTimeBlackhole } 
  from "../../rules/refactor_time_black_hole.js";

function renderReasonText(reasons: any): string {
  if (!reasons) return "";

  // New structure: ReasonsMap
  if (typeof reasons === "object" && !Array.isArray(reasons)) {
    if (typeof reasons.default === "string") {
      return reasons.default;
    }
    return "";
  }

  // Old structure: string[]
  if (Array.isArray(reasons)) {
    return reasons.join(" ");
  }

  return String(reasons);
}

/**
 * Infra Policy Engine (v0.2)
 *
 * Product modes:
 * - cold (default): Phase 1 surface (cold-first, single-hit, low-noise)
 * - full: v0.2 engine mode (can include latent rules / richer logic)
 */
export function evaluate(signals: DecisionSignal[], config: AppConfig): PolicyDecision {
  const mode = (config as any).mode ?? "cold";

  /**
   * Phase 1: Cold mode
   * - return WARN => guardrail maps WARN -> REQUIRE_CONFIRM
   * - return BLOCK => guardrail outputs BLOCK
   */
  if (mode === "cold") {
    const cold = evaluateColdRules(signals, config);

    if (cold.hit) {
      const isHard = cold.rule_id.includes("hard") || cold.rule_id.includes("block");
      return {
        action: isHard ? "BLOCK" : "WARN",
        reason: renderReasonText(cold.reasons),
        suggestedExits: isHard
          ? ["STOP", "TIMEBOX_10", "VALIDATE_FIRST"]
          : ["TIMEBOX_10", "VALIDATE_FIRST"],
      };
    }

    return { action: "ALLOW", reason: "No cold rules hit." };
  }

  /**
   * Full mode: keep your existing v0.2 baseline
   */
  const filesTouched = signals.find((s) => s.kind === "files_touched")?.value ?? 0;
  const { warn, block } = config.guardrail.files_touched;

  if (filesTouched >= block) {
    return {
      action: "BLOCK",
      reason: `Refactor risk exceeded hard threshold (files_touched=${filesTouched}).`,
      suggestedExits: ["STOP", "TIMEBOX_10", "VALIDATE_FIRST"],
    };
  }

  if (filesTouched >= warn) {
    return {
      action: "WARN",
      reason: `High change amplification detected (files_touched=${filesTouched}).`,
      suggestedExits: ["TIMEBOX_10", "VALIDATE_FIRST"],
    };
  }

  /**
   * Phase 2 latent rule: refactor_time_black_hole
   * - Only in full mode
   * - You can decide whether to surface as WARN or just log.
   */
  function toTriggerSignals(signals: any[]): TriggerSignals {
    // DecisionSignal[] → { [key]: value } 形式
    // 只提取 rule 需要的字段；缺失则为 undefined
    const m = new Map<string, unknown>();
    for (const s of signals ?? []) {
      const key = (s as any)?.key ?? (s as any)?.name ?? (s as any)?.kind;
      const value = (s as any)?.value;
      if (typeof key === "string") m.set(key, value);
    }
  
    const num = (k: string): number | undefined => {
      const v = m.get(k);
      return typeof v === "number" ? v : undefined;
    };
    const bool = (k: string): boolean | undefined => {
      const v = m.get(k);
      return typeof v === "boolean" ? v : undefined;
    };
  
    return {
      ship_gap_days: num("ship_gap_days"),
      refactor_commits_ratio: num("refactor_commits_ratio"),
      todo_growth_ratio: num("todo_growth_ratio"),
      churn_ratio: num("churn_ratio"),
      refactor_days: num("refactor_days"),
      files_touched: num("files_touched"),
      diff_lines_total: num("diff_lines_total"),
      touches_package_json: bool("touches_package_json"),
      touches_lockfile: bool("touches_lockfile"),
    } as TriggerSignals;
  }
  
  const triggerSignals = toTriggerSignals(signals);
  const r3 = evaluateAiMomentumOverride(config, triggerSignals);
  if (r3.hit) {
    return {
      action: "WARN",
      reason: `[latent:${r3.rule_id}] ${r3.reasons.join("；")}`,
      suggestedExits: ["TIMEBOX_10", "VALIDATE_FIRST"],
    };
  }

  const latent = evaluateRefactorTimeBlackhole(config, triggerSignals);
  

  if (latent.hit) {
    return {
      action: "WARN",
      reason: `[latent:${latent.rule_id}] ${latent.reasons.join("；")}`,
      suggestedExits: ["TIMEBOX_10", "VALIDATE_FIRST"],
    };
  }

  return { action: "ALLOW", reason: "No high-cost signals detected." };
}
