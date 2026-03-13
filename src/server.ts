import { logger } from "./utils/logger.js";
import { loadConfig } from "./config/loadConfig.js";
import { appendArtifact } from "./storage/state.js";

import { detectTriggers } from "./tools/detect_triggers.js";
import { assess } from "./tools/assess.js";
import { plan } from "./tools/plan.js";
import { followup } from "./tools/followup.js";

import { createMcpServer } from "./infra/mcp_server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { z } from "zod";
import type { TriggerSignals } from "./rules/refactor_time_black_hole.js";

import { LIMITS } from "./config/index.js";
import { Telemetry } from "./telemetry.js";


import {
  issueReceipt,
  findActiveReceiptByPlanHash,
  getReceiptState,
  consumeReceipt,
  type ReceiptRecord,
} from "./guardrail/receipt_store.js";

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
})

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

type ConfirmArg =
  | boolean
  | {
      mode?: unknown;
      receipt_id?: unknown;
      plan_hash?: unknown;
    };

function normalizeConfirm(
  confirmRaw: ConfirmArg | undefined
):
  | undefined
  | { mode: "ACK"; receipt_id?: string; plan_hash?: string }
  | { mode: "EXECUTE"; receipt_id: string; plan_hash: string }
  | { mode: "INVALID_LEGACY_TRUE" } {
  if (confirmRaw === undefined) return undefined;

  if (typeof confirmRaw === "boolean") {
    if (confirmRaw === true) return { mode: "INVALID_LEGACY_TRUE" };
    return undefined;
  }

  const mode = String((confirmRaw as any)?.mode ?? "");
  const receipt_id = (confirmRaw as any)?.receipt_id;
  const plan_hash = (confirmRaw as any)?.plan_hash;

  if (mode === "ACK") {
    return {
      mode: "ACK",
      receipt_id: typeof receipt_id === "string" ? receipt_id : undefined,
      plan_hash: typeof plan_hash === "string" ? plan_hash : undefined,
    };
  }

  if (mode === "EXECUTE") {
    if (typeof receipt_id === "string" && typeof plan_hash === "string") {
      return { mode: "EXECUTE", receipt_id, plan_hash };
    }
    return { mode: "INVALID_LEGACY_TRUE" };
  }

  return { mode: "INVALID_LEGACY_TRUE" };
}

async function main() {
  const config = loadConfig();

  const server = createMcpServer({
    name: config.app.name,
    version: config.app.version,
  });

  const telemetry = new Telemetry();

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
                  touches_lockfile: { type: "boolean" },
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
                  touches_lockfile: { type: "boolean" },
                },
              },
              confirm: {
                type: "object",
                description:
                  "Guardrail receipt confirmation. Use mode=EXECUTE with receipt_id and plan_hash returned by REQUIRE_CONFIRM.",
                properties: {
                  mode: { type: "string", enum: ["ACK", "EXECUTE"] },
                  receipt_id: { type: "string" },
                  plan_hash: { type: "string" },
                },
                required: ["mode", "receipt_id", "plan_hash"],
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
    const toolName: string = request.params.name;
    const args: ToolCallArgs = request.params.arguments;

    const safeArgs = clampText(args) as ToolCallArgs;

    switch (toolName) {
      case "detect_triggers": {
        const out = detectTriggers({
          signals: (safeArgs as any)?.signals as TriggerSignals | undefined,
        });
        appendArtifact(STATE_FILE, "signal", out);
        return {
          content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        };
      }

      case "assess": {
        const signals = (safeArgs as any)?.signals as TriggerSignals | undefined;
        if (!signals) throw new Error("signals parameter is required");

        const confirmNorm = normalizeConfirm((safeArgs as any)?.confirm as ConfirmArg | undefined);

        
        const out = assess({ config, signals, confirm: confirmNorm as any });
        appendArtifact(STATE_FILE, "decision", out);

        const guardrail = (out as any)?.guardrail;
        const action = guardrail?.action;
        const isExecute = (confirmNorm as any)?.mode === "EXECUTE";

        const ruleId =
          (out as any)?.rule_hit?.rule_id ?? (guardrail as any)?.rule_id ?? "unknown_rule";

        
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
                  "�?Decision Guardrail: BLOCK",
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

      
        if (typeof planHash === "string") {
            const existing = findActiveReceiptByPlanHash(planHash);
            if (existing) {
              receiptId = existing.receipt_id;
              if ((out as any)?.guardrail?.receipt) {
                (out as any).guardrail.receipt.receipt_id = existing.receipt_id;
                (out as any).guardrail.receipt.plan_hash = existing.plan_hash;
                (out as any).guardrail.receipt.scope = existing.scope;
              }
            }
          }

          if (
            typeof receiptId === "string" &&
            typeof planHash === "string" &&
            findActiveReceiptByPlanHash(planHash)?.receipt_id !== receiptId
          ) {
            const r: ReceiptRecord = {
              receipt_id: receiptId,
              plan_hash: planHash,
              scope: "this_call_only",
            };
            issueReceipt(r);
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
            receiptId && planHash
              ? `{ signals: ..., confirm: { mode: "EXECUTE", receipt_id: "${receiptId}", plan_hash: "${planHash}" } }`
              : `{ signals: ... }  // (missing receipt: ensure assess attaches guardrail.receipt)`;

          return {
            isError: true,
            content: [
              {
                type: "text",
                text: [
                  "⚠️ Decision Guardrail: REQUIRE_CONFIRM",
                  `Reason: ${guardrail.reason ?? "High risk detected."}`,
                  "",
                  "This action is blocked until you explicitly confirm the latest receipt.",
                  legacyTrue
                    ? "Note: legacy confirm:true is no longer accepted. Please confirm with receipt_id + plan_hash."
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

            const st = getReceiptState(rid);

           
            if (st.status === "consumed" && st.plan_hash === planHash) {
              (out as any).guardrail.already_executed = true;
              (out as any).guardrail.executed = true;
            } else if (st.status === "active" && st.plan_hash === planHash) {
             
              consumeReceipt(rid, planHash);

              telemetry.recordAction({
                rule_id: ruleId,
                decision: "REQUIRE_CONFIRM",
                interruption_id: rid,
                user_action: "confirmed",
                signals: signals ?? {},
              });
            } else {
 
              const out2 = assess({ config, signals, confirm: undefined });
              appendArtifact(STATE_FILE, "decision", out2);

              const g2 = (out2 as any)?.guardrail;
              const r2 = g2?.receipt;

              const r2PlanHash = r2?.plan_hash;
              const r2Reuse = typeof r2PlanHash === "string" ? findActiveReceiptByPlanHash(r2PlanHash) : null;
              if (r2Reuse && g2?.receipt) {
                g2.receipt.receipt_id = r2Reuse.receipt_id;
                g2.receipt.plan_hash = r2Reuse.plan_hash;
                g2.receipt.scope = r2Reuse.scope;
              }

              if (
                g2?.action === "REQUIRE_CONFIRM" &&
                r2?.receipt_id &&
                r2?.plan_hash &&
                (!r2Reuse || r2Reuse.receipt_id !== r2.receipt_id)
              ) {
                issueReceipt({
                  receipt_id: r2.receipt_id,
                  plan_hash: r2.plan_hash,
                  scope: "this_call_only",
                });
              }

              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: [
                      "⚠️ Decision Guardrail: REQUIRE_CONFIRM",
                      `Reason: ${(g2?.reason ?? "High risk detected.") + " (confirmation rejected: invalid or replayed receipt)"}`,
                      "",
                      "This action is blocked until you explicitly confirm the latest receipt.",
                      r2?.receipt_id && r2?.plan_hash
                        ? `Re-run the tool with: { signals: ..., confirm: { mode: "EXECUTE", receipt_id: "${r2.receipt_id}", plan_hash: "${r2.plan_hash}" } }`
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
          }

          const confirmedPlan = guardrail?.confirmation?.confirmed_plan_hash;
          const header = confirmedPlan
            ? `[confirmed] Guardrail receipt EXECUTE accepted (plan_hash=${confirmedPlan})\n\n`
            : "[confirmed] Guardrail ALLOW\n\n";

          return {
            content: [
              {
                type: "text",
                text: header + JSON.stringify(out, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(out, null, 2),
            },
          ],
        };
      }

      case "plan": {
        const out = plan({ decision: (safeArgs as any)?.decision });
        return {
          content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        };
      }

      case "followup": {
        const out = followup({ decision: (safeArgs as any)?.decision });
        return {
          content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

 
}

main().catch((_err) => {
  process.exit(1);
});


