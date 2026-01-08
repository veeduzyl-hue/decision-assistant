export const __guardrail_types = 2;

/**
 * Guardrail Receipt Protocol (v0.2)
 * A receipt represents a confirmable execution opportunity bound to a specific computed plan.
 */
export type GuardrailReceiptScope = "this_call_only" | "session" | "persisted";

export type GuardrailReceipt = {
  receipt_id: string;
  plan_hash: string;
  scope: GuardrailReceiptScope;
};

/**
 * Confirmation payloads (caller -> tool).
 * NOTE: This is the input shape (tools/assess.ts uses it), kept here for cross-tool reuse.
 */
export type ConfirmInput =
  | {
      mode: "ACK";
      /** Optional: caller can echo back a previous receipt_id for reconciliation, no gating effect */
      receipt_id?: string;
      plan_hash?: string;
    }
  | {
      mode: "EXECUTE";
      receipt_id: string;
      plan_hash: string;
    };

/**
 * Confirmation status (tool -> caller), for transparency / UX.
 */
export type GuardrailConfirmationError =
  | "STALE_RECEIPT_OR_PLAN_CHANGED"
  | "INVALID_CONFIRM_PAYLOAD";

export type GuardrailConfirmation = {
  /**
   * When action=REQUIRE_CONFIRM: required=true, otherwise false.
   * This is the single source of truth for UI.
   */
  required: boolean;

  /** ACK path */
  acknowledged?: boolean;
  ack_receipt_id?: string | null;

  /** EXECUTE accepted path */
  confirmed?: boolean;
  confirmed_plan_hash?: string;
  confirmed_receipt_id?: string;

  /** EXECUTE rejected path */
  rejected?: boolean;
  error?: GuardrailConfirmationError;
  provided?: { receipt_id: string; plan_hash: string };
  expected?: { plan_hash: string };
};

/**
 * Common optional envelope fields that can be attached by tools (e.g., tools/assess.ts).
 * IMPORTANT: evaluate_guardrail.ts should NOT set these; it only decides the state.
 */
export type GuardrailEnvelope = {
  /**
   * Receipt is present when action=REQUIRE_CONFIRM, and may also be echoed back when action=ALLOW
   * after confirmation (for auditability).
   */
  receipt?: GuardrailReceipt;

  /**
   * Whether the caller confirmation was accepted and execution is permitted.
   * - REQUIRE_CONFIRM: executed usually false
   * - ALLOW after confirm: executed true
   */
  executed?: boolean;

  /** Confirmation info for UI / scripts */
  confirmation?: GuardrailConfirmation;

  /**
   * Optional human-facing explanation.
   * - For REQUIRE_CONFIRM / BLOCK: reason is required by the protocol.
   * - For ALLOW: reason is optional but recommended (your current output includes it).
   */
  reason?: string;
};

/**
 * Externally visible states (3 only).
 * - REQUIRE_CONFIRM/BLOCK must include reason.
 * - ALLOW may include reason (recommended).
 */
export type GuardrailDecision =
  | ({ action: "ALLOW" } & GuardrailEnvelope)
  | ({ action: "REQUIRE_CONFIRM"; reason: string } & GuardrailEnvelope)
  | ({ action: "BLOCK"; reason: string } & GuardrailEnvelope);
