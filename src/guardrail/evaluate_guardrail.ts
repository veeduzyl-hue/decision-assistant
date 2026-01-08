import type { DecisionSignal, PolicyDecision } from "../infra/types/index.js";
import type { GuardrailDecision } from "./types.js";

/**
 * Decision Guardrail (v0.2)
 * - Deterministic
 * - No LLM
 * - Only outputs externally visible states:
 *   - ALLOW
 *   - REQUIRE_CONFIRM (with reason)
 *   - BLOCK (with reason)
 *
 * IMPORTANT:
 * - Do NOT attach receipt / executed / confirmation here.
 * - Those are composed in tools/assess.ts after evaluating guardrail state.
 */
export function evaluateGuardrail(input: {
  infraSignals: DecisionSignal[];
  policy: PolicyDecision;
}): GuardrailDecision {
  // 1) infra policy already BLOCK => hard block
  if (input.policy.action === "BLOCK") {
    return { action: "BLOCK", reason: input.policy.reason };
  }

  // 2) infra policy WARN => require explicit confirmation
  if (input.policy.action === "WARN") {
    return { action: "REQUIRE_CONFIRM", reason: input.policy.reason };
  }

  // 3) otherwise allow
  return { action: "ALLOW" };
}
