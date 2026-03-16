import { randomUUID } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { appendArtifact } from "./audit/artifacts.js";
import { LIMITS } from "./config/index.js";
import { loadConfig } from "./config/loadConfig.js";
import { assess } from "./modules/assess/assess.js";
import type { TriggerSignals } from "./modules/risk/refactor_time_black_hole.js";
import {
  buildExecutionKey,
  createSqlitePersistence,
  type ConsumeReceiptError,
  type DecisionLogEvent,
} from "./persistence/receipt_store.js";
import { createMcpServer } from "./runtime/mcp_server.js";
import {
  createErrorPayload,
  createToolErrorResult,
  DecisionAssistantError,
  EXIT_PERSISTENCE_FAILURE,
  fatalExitFromError,
  toUnknownErrorPayload,
} from "./runtime/error_semantics.js";
import { detectTriggers } from "./runtime/tools/detect_triggers.js";
import { followup } from "./runtime/tools/followup.js";
import { plan } from "./runtime/tools/plan.js";
import { Telemetry } from "./telemetry.js";

const STATE_FILE = ".decision_assistant/state.json";

const ToolsListRequestSchema = z.object({
  method: z.literal("tools/list"),
  params: z.object({}).optional(),
});

const ToolsCallRequestSchema = z.object({
  method: z.literal("tools/call"),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.unknown()).optional(),
  }),
});

const ToolsListResultSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      inputSchema: z.unknown().optional(),
    })
  ),
});

const ToolsCallResultSchema = z.object({
  isError: z.boolean().optional(),
  content: z.array(
    z.object({
      type: z.literal("text"),
      text: z.string(),
    })
  ),
});

(ToolsListRequestSchema as any).result = ToolsListResultSchema;
(ToolsCallRequestSchema as any).result = ToolsCallResultSchema;

type ToolCallArgs = Record<string, unknown> | undefined;

type ConfirmArg =
  | boolean
  | {
      mode?: unknown;
      receipt_id?: unknown;
      plan_hash?: unknown;
      nonce?: unknown;
    };

function clampText(input: unknown): unknown {
  if (typeof input === "string") {
    return input.length > LIMITS.MAX_TEXT_LENGTH ? input.slice(0, LIMITS.MAX_TEXT_LENGTH) : input;
  }
  if (Array.isArray(input)) return input.map(clampText);
  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([k, v]) => [k, clampText(v)])
    );
  }
  return input;
}

function normalizeConfirm(
  confirmRaw: ConfirmArg | undefined
):
  | undefined
  | { mode: "ACK"; receipt_id?: string; plan_hash?: string }
  | { mode: "EXECUTE"; receipt_id: string; plan_hash: string; nonce: string }
  | { mode: "INVALID_LEGACY_TRUE" } {
  if (confirmRaw === undefined) return undefined;

  if (typeof confirmRaw === "boolean") {
    if (confirmRaw === true) return { mode: "INVALID_LEGACY_TRUE" };
    return undefined;
  }

  const mode = String((confirmRaw as any)?.mode ?? "");
  const receipt_id = (confirmRaw as any)?.receipt_id;
  const plan_hash = (confirmRaw as any)?.plan_hash;
  const nonce = (confirmRaw as any)?.nonce;

  if (mode === "ACK") {
    return {
      mode: "ACK",
      receipt_id: typeof receipt_id === "string" ? receipt_id : undefined,
      plan_hash: typeof plan_hash === "string" ? plan_hash : undefined,
    };
  }

  if (mode === "EXECUTE") {
    if (
      typeof receipt_id === "string" &&
      typeof plan_hash === "string" &&
      typeof nonce === "string"
    ) {
      return { mode: "EXECUTE", receipt_id, plan_hash, nonce };
    }
    return { mode: "INVALID_LEGACY_TRUE" };
  }

  return { mode: "INVALID_LEGACY_TRUE" };
}

function nowIso(): string {
  return new Date().toISOString();
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60 * 1000).toISOString();
}

function makeDecisionId(): string {
  return `dec_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function makeEventId(): string {
  return `evt_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function reasonCodesFor(ruleId: string, action: unknown): string[] {
  const codes = [ruleId];
  if (typeof action === "string") codes.push(action);
  return codes.filter(Boolean);
}

function toConfirmationError(error: ConsumeReceiptError):
  | "MISSING_RECEIPT"
  | "RECEIPT_CONSUMED"
  | "NONCE_MISMATCH"
  | "REPLAY_DETECTED"
  | "RECEIPT_EXPIRED"
  | "PLAN_HASH_MISMATCH"
  | "INVALID_RECEIPT" {
  switch (error) {
    case "MISSING_RECEIPT":
      return "MISSING_RECEIPT";
    case "RECEIPT_CONSUMED":
      return "RECEIPT_CONSUMED";
    case "NONCE_MISMATCH":
      return "NONCE_MISMATCH";
    case "REPLAY_DETECTED":
      return "REPLAY_DETECTED";
    case "RECEIPT_EXPIRED":
      return "RECEIPT_EXPIRED";
    case "PLAN_HASH_MISMATCH":
      return "PLAN_HASH_MISMATCH";
    default:
      return "INVALID_RECEIPT";
  }
}

function withPersistence<T>(operation: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw new DecisionAssistantError({
      code: "PERSISTENCE_FAILURE",
      message: "Persistence operation failed.",
      exitCode: EXIT_PERSISTENCE_FAILURE,
      details: {
        operation,
        ...(error instanceof Error ? { cause: error.message } : {}),
      },
    });
  }
}

async function main() {
  const config = loadConfig();
  const persistence = withPersistence("create_sqlite_persistence", () => createSqlitePersistence());

  const server = createMcpServer({
    name: config.app.name,
    version: config.app.version,
  });

  const telemetry = new Telemetry();

  const appendDecisionEvent = (
    event: Omit<DecisionLogEvent, "event_id" | "schema_version">
  ): void => {
    withPersistence("append_decision_log", () =>
      persistence.decisionLogs.append({
        event_id: makeEventId(),
        schema_version: "decision-assistant/decision-log/v1",
        ...event,
      })
    );
  };

  server.setRequestHandler(ToolsListRequestSchema as any, async () => {
    return {
      tools: [
        {
          name: "detect_triggers",
          description: "Extract structured trigger signals from context.",
          inputSchema: {
            type: "object",
            properties: {
              signals: {
                type: "object",
                properties: {
                  ship_gap_days: { type: "number" },
                  refactor_commits_ratio: { type: "number" },
                  todo_growth_ratio: { type: "number" },
                  churn_ratio: { type: "number" },
                  refactor_days: { type: "number" },
                  files_touched: { type: "number" },
                  diff_lines_total: { type: "number" },
                  touches_package_json: { type: "boolean" },
                  touches_lockfile: { type: "boolean" }
                },
              },
            },
          },
        },
        {
          name: "assess",
          description: "Assess risk and decision based on signals.",
          inputSchema: {
            type: "object",
            properties: {
              signals: {
                type: "object",
                properties: {
                  ship_gap_days: { type: "number" },
                  refactor_commits_ratio: { type: "number" },
                  todo_growth_ratio: { type: "number" },
                  churn_ratio: { type: "number" },
                  refactor_days: { type: "number" },
                  files_touched: { type: "number" },
                  diff_lines_total: { type: "number" },
                  touches_package_json: { type: "boolean" },
                  touches_lockfile: { type: "boolean" }
                },
              },
              confirm: {
                type: "object",
                description:
                  "Guardrail receipt confirmation. Use mode=EXECUTE with receipt_id, plan_hash, and nonce returned by REQUIRE_CONFIRM.",
                properties: {
                  mode: { type: "string", enum: ["ACK", "EXECUTE"] },
                  receipt_id: { type: "string" },
                  plan_hash: { type: "string" },
                  nonce: { type: "string" },
                },
                required: ["mode", "receipt_id", "plan_hash", "nonce"],
              },
            },
            required: ["signals"],
          },
        },
        {
          name: "plan",
          description: "Generate next actions based on decision.",
          inputSchema: {
            type: "object",
            properties: {
              decision: { type: "object" },
            },
            required: ["decision"],
          },
        },
        {
          name: "followup",
          description: "Ask minimal follow-up questions.",
          inputSchema: {
            type: "object",
            properties: {
              decision: { type: "object" },
            },
            required: ["decision"],
          },
        },
      ],
    };
  });

  server.setRequestHandler(ToolsCallRequestSchema as any, async (request: any) => {
    try {
      const toolName: string = request.params.name;
      const args: ToolCallArgs = request.params.arguments;
      const safeArgs = clampText(args) as ToolCallArgs;

      switch (toolName) {
      case "detect_triggers": {
        const out = detectTriggers({
          signals: (safeArgs as any)?.signals as TriggerSignals | undefined,
        });
        appendArtifact(STATE_FILE, "signal", out);
        return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
      }

      case "assess": {
        const signals = (safeArgs as any)?.signals as TriggerSignals | undefined;
        if (!signals) {
          return createToolErrorResult(
            createErrorPayload({
              code: "INVALID_INPUT",
              message: "signals parameter is required",
              details: { tool: "assess", field: "signals" },
            })
          );
        }

        const requestTs = nowIso();
        const decisionId = makeDecisionId();
        const confirmNorm = normalizeConfirm((safeArgs as any)?.confirm as ConfirmArg | undefined);
        const isExecute = (confirmNorm as any)?.mode === "EXECUTE";

        const out = assess({ config, signals, confirm: confirmNorm as any });
        appendArtifact(STATE_FILE, "decision", out);

        const guardrail = (out as any)?.guardrail;
        const action = guardrail?.action;
        const ruleId =
          (out as any)?.rule_hit?.rule_id ?? (guardrail as any)?.rule_id ?? "unknown_rule";
        const baseReasonCodes = reasonCodesFor(ruleId, action);

        appendDecisionEvent({
          decision_id: decisionId,
          ts: requestTs,
          event_type: "decision.assessed",
          action: isExecute ? "EXECUTE" : "ASSESS",
          verdict:
            action === "ALLOW" && isExecute
              ? "EXECUTE_ACCEPTED"
              : action === "BLOCK"
                ? "BLOCK"
                : "REQUIRE_CONFIRM",
          policy_version: config.app.version,
          engine_version: config.app.version,
          reason_codes: baseReasonCodes,
          receipt_id: guardrail?.receipt?.receipt_id,
          plan_hash: guardrail?.receipt?.plan_hash,
          nonce: guardrail?.receipt?.nonce ?? (confirmNorm as any)?.nonce,
          message: guardrail?.reason,
        });

        if ((confirmNorm as any)?.mode === "ACK") {
          const rid = (confirmNorm as any)?.receipt_id;
          if (typeof rid === "string") {
            telemetry.recordAction({
              rule_id: ruleId,
              decision: "REQUIRE_CONFIRM",
              interruption_id: rid,
              user_action: "aborted",
              signals: signals ?? {},
            });
          }
        }

        if (action === "BLOCK") {
          telemetry.recordInterruption({
            rule_id: ruleId,
            decision: "BLOCK",
            signals: signals ?? {},
            user_action: "pending",
          });

          return {
            isError: true,
            content: [
              {
                type: "text",
                text: [
                  "Decision Guardrail: BLOCK",
                  `Reason: ${guardrail.reason ?? "Risk threshold exceeded."}`,
                  "",
                  "Action blocked. Reduce risk signals and retry.",
                  "",
                  "Full decision payload:",
                  JSON.stringify(out, null, 2),
                ].join("\n"),
              },
            ],
          };
        }

        if (action === "REQUIRE_CONFIRM") {
          const receipt = guardrail?.receipt;
          let receiptId = receipt?.receipt_id;
          const planHash = receipt?.plan_hash;
          let nonce = receipt?.nonce;

          const activeReceipt =
            typeof planHash === "string"
              ? withPersistence("find_active_receipt_by_plan_hash", () =>
                  persistence.receipts.findActiveReceiptByPlanHash(planHash, requestTs)
                )
              : null;

          if (activeReceipt && (out as any)?.guardrail?.receipt) {
            receiptId = activeReceipt.receipt_id;
            nonce = activeReceipt.nonce;
            (out as any).guardrail.receipt.receipt_id = activeReceipt.receipt_id;
            (out as any).guardrail.receipt.plan_hash = activeReceipt.plan_hash;
            (out as any).guardrail.receipt.nonce = activeReceipt.nonce;
            (out as any).guardrail.receipt.scope = activeReceipt.scope;
          }

          if (
            typeof receiptId === "string" &&
            typeof planHash === "string" &&
            typeof nonce === "string" &&
            (!activeReceipt || activeReceipt.receipt_id !== receiptId)
          ) {
            withPersistence("issue_receipt", () =>
              persistence.receipts.issueReceipt({
                receipt_id: receiptId,
                plan_hash: planHash,
                nonce,
                scope: "this_call_only",
                issued_at: requestTs,
                expires_at: addMinutes(requestTs, 5),
              })
            );
            appendDecisionEvent({
              decision_id: decisionId,
              ts: requestTs,
              event_type: "receipt.issued",
              action: "ASSESS",
              verdict: "REQUIRE_CONFIRM",
              policy_version: config.app.version,
              engine_version: config.app.version,
              reason_codes: baseReasonCodes,
              receipt_id: receiptId,
              plan_hash: planHash,
              nonce,
              message: "Receipt issued for guarded execution.",
            });
          } else if (activeReceipt) {
            appendDecisionEvent({
              decision_id: decisionId,
              ts: requestTs,
              event_type: "receipt.reused",
              action: "ASSESS",
              verdict: "REQUIRE_CONFIRM",
              policy_version: config.app.version,
              engine_version: config.app.version,
              reason_codes: baseReasonCodes,
              receipt_id: activeReceipt.receipt_id,
              plan_hash: activeReceipt.plan_hash,
              nonce: activeReceipt.nonce,
              message: "Active receipt reused for identical plan hash.",
            });
          }

          telemetry.recordInterruption({
            rule_id: ruleId,
            decision: "REQUIRE_CONFIRM",
            signals: signals ?? {},
            user_action: "pending",
            interruption_id: typeof receiptId === "string" ? receiptId : undefined,
          });

          const legacyTrue = (confirmNorm as any)?.mode === "INVALID_LEGACY_TRUE";
          const rerunHint =
            receiptId && planHash && nonce
              ? `{ signals: ..., confirm: { mode: "EXECUTE", receipt_id: "${receiptId}", plan_hash: "${planHash}", nonce: "${nonce}" } }`
              : `{ signals: ... }  // (missing receipt: ensure assess attaches guardrail.receipt)`;

          return {
            isError: true,
            content: [
              {
                type: "text",
                text: [
                  "Decision Guardrail: REQUIRE_CONFIRM",
                  `Reason: ${guardrail.reason ?? "High risk detected."}`,
                  "",
                  "This action is blocked until you explicitly confirm the latest receipt.",
                  legacyTrue
                    ? "Note: legacy confirm:true is no longer accepted. Please confirm with receipt_id + plan_hash + nonce."
                    : "",
                  `Re-run the tool with: ${rerunHint}`,
                  "",
                  `Local-only log: ${telemetry.getFilePath()} (disable: DA_TELEMETRY=0)`,
                  "",
                  "Full decision payload:",
                  JSON.stringify(out, null, 2),
                ]
                  .filter(Boolean)
                  .join("\n"),
              },
            ],
          };
        }

        if (action === "ALLOW") {
          if (isExecute) {
            const rid = (confirmNorm as any)?.receipt_id as string;
            const planHash = (confirmNorm as any)?.plan_hash as string;
            const nonce = (confirmNorm as any)?.nonce as string;

            const consumeResult = withPersistence("consume_receipt", () =>
              persistence.receipts.consumeReceipt({
                receipt_id: rid,
                plan_hash: planHash,
                nonce,
                nowIso: requestTs,
              })
            );

            if (!consumeResult.ok) {
              appendDecisionEvent({
                decision_id: decisionId,
                ts: requestTs,
                event_type: "execute.rejected",
                action: "EXECUTE",
                verdict: "EXECUTE_REJECTED",
                policy_version: config.app.version,
                engine_version: config.app.version,
                reason_codes: [...baseReasonCodes, consumeResult.error],
                receipt_id: rid,
                plan_hash: planHash,
                nonce,
                message: `Execution rejected: ${consumeResult.error}.`,
              });

              const out2 = assess({ config, signals, confirm: undefined });
              appendArtifact(STATE_FILE, "decision", out2);

              const g2 = (out2 as any)?.guardrail;
              const r2 = g2?.receipt;
              const r2Reuse =
                typeof r2?.plan_hash === "string"
                  ? withPersistence("find_active_receipt_by_plan_hash", () =>
                      persistence.receipts.findActiveReceiptByPlanHash(r2.plan_hash, requestTs)
                    )
                  : null;

              if (r2Reuse && g2?.receipt) {
                g2.receipt.receipt_id = r2Reuse.receipt_id;
                g2.receipt.plan_hash = r2Reuse.plan_hash;
                g2.receipt.nonce = r2Reuse.nonce;
                g2.receipt.scope = r2Reuse.scope;
              }

              if (
                g2?.action === "REQUIRE_CONFIRM" &&
                r2?.receipt_id &&
                r2?.plan_hash &&
                r2?.nonce &&
                (!r2Reuse || r2Reuse.receipt_id !== r2.receipt_id)
              ) {
                withPersistence("issue_receipt", () =>
                  persistence.receipts.issueReceipt({
                    receipt_id: r2.receipt_id,
                    plan_hash: r2.plan_hash,
                    nonce: r2.nonce,
                    scope: "this_call_only",
                    issued_at: requestTs,
                    expires_at: addMinutes(requestTs, 5),
                  })
                );
                appendDecisionEvent({
                  decision_id: decisionId,
                  ts: requestTs,
                  event_type: "receipt.issued",
                  action: "EXECUTE",
                  verdict: "REQUIRE_CONFIRM",
                  policy_version: config.app.version,
                  engine_version: config.app.version,
                  reason_codes: [...baseReasonCodes, consumeResult.error],
                  receipt_id: r2.receipt_id,
                  plan_hash: r2.plan_hash,
                  nonce: r2.nonce,
                  message: "Replacement receipt issued after execute rejection.",
                });
              } else if (r2Reuse) {
                appendDecisionEvent({
                  decision_id: decisionId,
                  ts: requestTs,
                  event_type: "receipt.reused",
                  action: "EXECUTE",
                  verdict: "REQUIRE_CONFIRM",
                  policy_version: config.app.version,
                  engine_version: config.app.version,
                  reason_codes: [...baseReasonCodes, consumeResult.error],
                  receipt_id: r2Reuse.receipt_id,
                  plan_hash: r2Reuse.plan_hash,
                  nonce: r2Reuse.nonce,
                  message: "Active receipt reused after execute rejection.",
                });
              }

              if (g2?.confirmation) {
                g2.confirmation.rejected = true;
                g2.confirmation.error = toConfirmationError(consumeResult.error);
                g2.confirmation.provided = { receipt_id: rid, plan_hash: planHash, nonce };
                if (r2?.plan_hash) {
                  g2.confirmation.expected = { plan_hash: r2.plan_hash, nonce: r2?.nonce };
                }
              }

              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: [
                      "Decision Guardrail: REQUIRE_CONFIRM",
                      `Reason: ${(g2?.reason ?? "High risk detected.") + ` (confirmation rejected: ${consumeResult.error.toLowerCase()})`}`,
                      "",
                      "This action is blocked until you explicitly confirm the latest receipt.",
                      r2?.receipt_id && r2?.plan_hash && r2?.nonce
                        ? `Re-run the tool with: { signals: ..., confirm: { mode: "EXECUTE", receipt_id: "${r2.receipt_id}", plan_hash: "${r2.plan_hash}", nonce: "${r2.nonce}" } }`
                        : `Re-run the tool with: { signals: ... }`,
                      "",
                      `Local-only log: ${telemetry.getFilePath()} (disable: DA_TELEMETRY=0)`,
                      "",
                      "Full decision payload:",
                      JSON.stringify(out2, null, 2),
                    ].join("\n"),
                  },
                ],
              };
            }

            appendDecisionEvent({
              decision_id: decisionId,
              ts: requestTs,
              event_type: "receipt.consumed",
              action: "EXECUTE",
              verdict: "EXECUTE_ACCEPTED",
              policy_version: config.app.version,
              engine_version: config.app.version,
              reason_codes: baseReasonCodes,
              receipt_id: rid,
              plan_hash: planHash,
              nonce,
              message: "Receipt consumed successfully.",
            });
            appendDecisionEvent({
              decision_id: decisionId,
              ts: requestTs,
              event_type: "execute.accepted",
              action: "EXECUTE",
              verdict: "EXECUTE_ACCEPTED",
              policy_version: config.app.version,
              engine_version: config.app.version,
              reason_codes: baseReasonCodes,
              receipt_id: rid,
              plan_hash: planHash,
              nonce,
              message: `Execution accepted for key ${buildExecutionKey(rid, planHash, nonce)}.`,
            });

            telemetry.recordAction({
              rule_id: ruleId,
              decision: "REQUIRE_CONFIRM",
              interruption_id: rid,
              user_action: "confirmed",
              signals: signals ?? {},
            });
          }

          const confirmedPlan = guardrail?.confirmation?.confirmed_plan_hash;
          const header = confirmedPlan
            ? `[confirmed] Guardrail receipt EXECUTE accepted (plan_hash=${confirmedPlan})\n\n`
            : "[confirmed] Guardrail ALLOW\n\n";

          return {
            content: [{ type: "text", text: header + JSON.stringify(out, null, 2) }],
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        };
      }

      case "plan": {
        const out = plan({ decision: (safeArgs as any)?.decision });
        return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
      }

      case "followup": {
        const out = followup({ decision: (safeArgs as any)?.decision });
        return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
      }

        default:
          return createToolErrorResult(
            createErrorPayload({
              code: "UNKNOWN_TOOL",
              message: `Unknown tool: ${toolName}`,
              details: { tool: toolName },
            })
          );
      }
    } catch (error) {
      return createToolErrorResult(toUnknownErrorPayload(error));
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  fatalExitFromError(error);
});
