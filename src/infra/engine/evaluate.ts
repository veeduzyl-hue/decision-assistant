import type { DecisionSignal } from "../types/signal.js";
import type { PolicyDecision } from "../types/policy.js";
import type { AppConfig } from "../../config/defaults.js";

/**
 * Infra Policy Engine (v0.2)
 *
 * - Deterministic
 * - No LLM
 * - Thresholds are "default-fixed" via config (not hard-coded in logic)
 */
export function evaluate(signals: DecisionSignal[], config: AppConfig): PolicyDecision {
  // Single source of truth for this metric
  const filesTouched =
    signals.find((s) => s.kind === "files_touched")?.value ?? 0;

  // Default-fixed thresholds (config as source of truth)
  const { warn, block } = config.guardrail.files_touched;

  /**
   * v0.2 HARD BLOCK
   * A 方案：不扩展 suggestedExits 的枚举值，因此把更细的建议映射为现有三类：
   * - REVERT_TO_STABLE  -> STOP
   * - SPIKE_BRANCH      -> TIMEBOX_10
   * - SPLIT_CHANGESET   -> VALIDATE_FIRST
   */
  if (filesTouched >= block) {
    return {
      action: "BLOCK",
      reason: `Refactor risk exceeded hard threshold (files_touched=${filesTouched}).`,
      suggestedExits: ["STOP", "TIMEBOX_10", "VALIDATE_FIRST"],
    };
  }

  // WARN threshold (existing behavior)
  if (filesTouched >= warn) {
    return {
      action: "WARN",
      reason: `High change amplification detected (files_touched=${filesTouched}).`,
      suggestedExits: ["TIMEBOX_10", "VALIDATE_FIRST"],
    };
  }

  // Default: ALLOW
  return {
    action: "ALLOW",
    reason: "No high-cost signals detected.",
  };
}
