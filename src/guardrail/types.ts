export const __guardrail_types = 1;

export type GuardrailDecision =
  | { action: "ALLOW" }
  | { action: "REQUIRE_CONFIRM"; reason: string }
  | { action: "BLOCK"; reason: string };
