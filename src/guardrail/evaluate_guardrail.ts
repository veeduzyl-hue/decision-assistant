import type { DecisionSignal, PolicyDecision } from "../infra/types/index.js";
import type { GuardrailDecision } from "./types.js";




/**
 * Decision Guardrail v0.1
 * - Deterministic
 * - No LLM
 * - No natural language input
 */
export function evaluateGuardrail(input: {
  infraSignals: DecisionSignal[];
  policy: PolicyDecision;
}): GuardrailDecision {
  const filesTouched =
    input.infraSignals.find(s => s.kind === "files_touched")?.value ?? 0;

  // Guardrail #1: Refactor Time Black Hole — HARD STOP
  if (input.policy.action === "WARN" && filesTouched >= 12) {
    return {
      action: "BLOCK",
      reason:
        "Refactor risk exceeded safe threshold (12+ files touched). " +
        "Further changes are blocked to prevent a refactor time black hole."
    };
  }

  return { action: "ALLOW" };
}
