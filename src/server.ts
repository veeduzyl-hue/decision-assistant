import { logger } from "./utils/logger.js";
import { loadConfig } from "./config/loadConfig.js";
import { appendArtifact } from "./storage/state.js";

import { detectTriggers } from "./tools/detect_triggers.js";
import { assess } from "./tools/assess.js";
import { plan } from "./tools/plan.js";
import { followup } from "./tools/followup.js";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { z } from "zod";
import type { TriggerSignals } from "./rules/refactor_time_black_hole.js";

const STATE_FILE = ".decision_assistant/state.json";

/**
 * SDK 1.25.1 的 setRequestHandler 要求：
 * - request schema 必须包含 method 的 z.literal(...)（method literal）
 * - 并且 request schema 需要挂载 result schema： (schema as any).result = ResultSchema
 *   否则 SDK 在校验 handler 返回值时会读到 undefined，从而报 _zod 错误
 */

// -------------------- Request Schemas (Envelope) --------------------
const ToolsListRequestSchema = z.object({
  method: z.literal("tools/list"),
  // params 通常为空；为兼容，允许缺省或空对象
  params: z.object({}).optional(),
});

const ToolsCallRequestSchema = z.object({
  method: z.literal("tools/call"),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.unknown()).optional(),
  }),
});

// -------------------- Result Schemas (Required by SDK 1.25.1) --------------------
const ToolsListResultSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      // MCP tools/list 返回的 inputSchema 本质是 JSON Schema 对象，这里允许 unknown 以兼容 v0.1
      inputSchema: z.unknown().optional(),
    })
  ),
});

const ToolsCallResultSchema = z.object({
  content: z.array(
    z.object({
      type: z.literal("text"),
      text: z.string(),
    })
  ),
});

// ✅ 关键：绑定 result schema，避免 _zod 报错
(ToolsListRequestSchema as any).result = ToolsListResultSchema;
(ToolsCallRequestSchema as any).result = ToolsCallResultSchema;

type ToolCallArgs = Record<string, unknown> | undefined;

async function main() {
  const config = loadConfig();

  const server = new Server(
    {
      name: config.app.name,
      version: config.app.version,
    },
    {
      // v0.1：capabilities.tools 可以先留空；
      // 工具清单由 tools/list 返回即可（更直观、更兼容）
      capabilities: {
        tools: {},
      },
    }
  );

  // tools/list
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
                  // v0.1: 这里列的是你最早 smoke 用的字段；
                  // 实际 rule 还用到了 refactor_days（见你后续调试），建议你后续把它也补进 schema
                  ship_gap_days: { type: "number" },
                  refactor_commits_ratio: { type: "number" },
                  todo_growth_ratio: { type: "number" },
                  churn_ratio: { type: "number" },
                  refactor_days: { type: "number" },
                },
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

  // tools/call
  server.setRequestHandler(
    ToolsCallRequestSchema as any,
    async (request: any) => {
      const toolName: string = request.params.name;
      const args: ToolCallArgs = request.params.arguments;

      switch (toolName) {
        case "detect_triggers": {
          const out = detectTriggers({
            signals: (args as any)?.signals as TriggerSignals | undefined,
          });
          appendArtifact(STATE_FILE, "signal", out);
          return {
            content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
          };
        }

        case "assess": {
          // 如需排查再打开（建议保持 stderr 打印，避免污染 MCP stdout 协议）
          // console.error("[debug] tools/call assess args =", JSON.stringify(args, null, 2));
          // console.error("[debug] tools/call assess args.signals =", JSON.stringify((args as any)?.signals ?? null, null, 2));

          const signals = (args as any)?.signals as TriggerSignals | undefined;
          if (!signals) throw new Error("signals parameter is required");

          const out = assess({ config, signals });
          appendArtifact(STATE_FILE, "decision", out);
          return {
            content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
          };
        }

        case "plan": {
          const out = plan({ decision: (args as any)?.decision });
          return {
            content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
          };
        }

        case "followup": {
          const out = followup({ decision: (args as any)?.decision });
          return {
            content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // ⚠️ stdio 模式下：不要向 stdout 输出任何日志，否则会污染 MCP 协议
  // 如需排查，仅允许 stderr：
  // console.error(`MCP server started: ${config.app.name}@${config.app.version}`);
}

// 关键：main() 必须在函数体外调用
main().catch((err) => {
  // 同样：只允许 stderr
  // console.error("Fatal error:", err);
  process.exit(1);
});
