export const ERROR_PAYLOAD_VERSION = "decision-assistant/error/v1";

export const EXIT_OK = 0;
export const EXIT_INTERNAL_ERROR = 1;
export const EXIT_PERSISTENCE_FAILURE = 2;

export type StableErrorCode =
  | "INVALID_INPUT"
  | "UNKNOWN_TOOL"
  | "PERSISTENCE_FAILURE"
  | "INTERNAL_ERROR"
  | "STALE_RECEIPT_OR_PLAN_CHANGED"
  | "INVALID_CONFIRM_PAYLOAD"
  | "MISSING_RECEIPT"
  | "RECEIPT_CONSUMED"
  | "NONCE_MISMATCH"
  | "REPLAY_DETECTED"
  | "RECEIPT_EXPIRED"
  | "INVALID_RECEIPT"
  | "PLAN_HASH_MISMATCH";

export type StableErrorPayload = {
  ok: false;
  schema_version: typeof ERROR_PAYLOAD_VERSION;
  code: StableErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export class DecisionAssistantError extends Error {
  readonly code: StableErrorCode;
  readonly exitCode: number;
  readonly details?: Record<string, unknown>;

  constructor(args: {
    code: StableErrorCode;
    message: string;
    exitCode?: number;
    details?: Record<string, unknown>;
  }) {
    super(args.message);
    this.name = "DecisionAssistantError";
    this.code = args.code;
    this.exitCode = args.exitCode ?? EXIT_INTERNAL_ERROR;
    this.details = args.details;
  }
}

export function createErrorPayload(args: {
  code: StableErrorCode;
  message: string;
  details?: Record<string, unknown>;
}): StableErrorPayload {
  return {
    ok: false,
    schema_version: ERROR_PAYLOAD_VERSION,
    code: args.code,
    message: args.message,
    ...(args.details ? { details: args.details } : {}),
  };
}

export function formatToolErrorText(payload: StableErrorPayload): string {
  return [
    `Decision Assistant Error: ${payload.code}`,
    `Message: ${payload.message}`,
    "",
    "Error payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

export function createToolErrorResult(payload: StableErrorPayload): {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    isError: true,
    content: [{ type: "text", text: formatToolErrorText(payload) }],
  };
}

export function toUnknownErrorPayload(error: unknown): StableErrorPayload {
  if (error instanceof DecisionAssistantError) {
    return createErrorPayload({
      code: error.code,
      message: error.message,
      details: error.details,
    });
  }

  return createErrorPayload({
    code: "INTERNAL_ERROR",
    message: "Unexpected internal failure.",
  });
}

export function fatalExitFromError(error: unknown): never {
  const payload = toUnknownErrorPayload(error);
  const exitCode =
    error instanceof DecisionAssistantError ? error.exitCode : EXIT_INTERNAL_ERROR;
  console.error(JSON.stringify(payload));
  process.exit(exitCode);
}
