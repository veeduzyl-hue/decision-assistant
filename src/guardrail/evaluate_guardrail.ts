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

/**
 * Soft-block compatibility bridge:
 * Some policy engines may emit action=BLOCK for what is effectively a "hard threshold exceeded"
 * scenario that we still want to handle via confirmation flow (REQUIRE_CONFIRM + receipt).
 *
 * We ONLY downgrade BLOCK -> REQUIRE_CONFIRM when the reason indicates a threshold-style block.
 * True hard-stops should remain BLOCK.
 */
function isThresholdStyleBlock(reason: unknown): boolean {
  if (typeof reason !== "string") return false;
  const r = reason.toLowerCase();

  // Typical pattern we saw in your logs:
  // "Refactor risk exceeded hard threshold (files_touched=20)."
  const mentionsHardThreshold = r.includes("hard threshold");
  const mentionsFilesTouched = r.includes("files_touched=") || r.includes("files touched");
  const mentionsExceeded = r.includes("exceeded") || r.includes("exceed");

  // If it's an explicit "hard stop" / "extreme" / "no receipt" kind of wording, keep it BLOCK.
  const explicitHardStop =
    r.includes("hard stop") ||
    r.includes("extreme") ||
    r.includes("no receipt") ||
    r.includes("cannot be confirmed");

  if (explicitHardStop) return false;

  return mentionsHardThreshold && mentionsExceeded && mentionsFilesTouched;
}

export function evaluateGuardrail(input: {
  infraSignals: DecisionSignal[];
  policy: PolicyDecision;
}): GuardrailDecision {
  // 1) infra policy BLOCK
  if (input.policy.action === "BLOCK") {
    // downgrade "threshold-style block" into confirmation gate
    if (isThresholdStyleBlock(input.policy.reason)) {
      return { action: "REQUIRE_CONFIRM", reason: input.policy.reason };
    }
    // true hard block
    return { action: "BLOCK", reason: input.policy.reason };
  }

  // 2) infra policy WARN => require explicit confirmation
  if (input.policy.action === "WARN") {
    return { action: "REQUIRE_CONFIRM", reason: input.policy.reason };
  }

  // 3) otherwise allow
  return { action: "ALLOW" };
}