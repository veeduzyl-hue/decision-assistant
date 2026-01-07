import type { DecisionSignal } from "../types/signal.js";
import type { PolicyDecision } from "../types/policy.js";

export function evaluate(signals: DecisionSignal[]): PolicyDecision {
  const filesTouched = signals.find(s => s.kind === "files_touched")?.value ?? 0;

  if (filesTouched >= 8) {
    return {
      action: "WARN",
      reason: `High change amplification detected (files_touched=${filesTouched}).`,
      suggestedExits: ["TIMEBOX_10", "VALIDATE_FIRST"],
    };
  }

  return {
    action: "ALLOW",
    reason: "No high-cost signals detected.",
  };
}
