import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";

/**
 * SDK 1.25.1: Client.request 需要传入 “带 method literal 的 request schema”
 * 且 request schema 上要绑定 result schema： (schema).result = ResultSchema
 * 否则响应解析阶段会出现 _zod 报错。
 */

// ---- request schemas ----
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

// ---- result schemas ----
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
  content: z.array(
    z.object({
      type: z.literal("text"),
      text: z.string(),
    })
  ),
});

// ✅ 关键：绑定 result schema
ToolsListRequestSchema.result = ToolsListResultSchema;
ToolsCallRequestSchema.result = ToolsCallResultSchema;

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/server.js"],
    cwd: process.cwd(),
  });

  const client = new Client({ name: "smoke-test", version: "0.1.0" });
  await client.connect(transport);

  // 1) tools/list（可选，但建议先看工具是否注册）


  // 2) tools/call: assess（关键闭环）
  const signals = {
    refactor_days: 5,
    ship_gap_days: 5,
    refactor_commits_ratio: 0.72,
    todo_growth_ratio: 0.35,
    churn_ratio: 0.42,
  };

  const out = await client.request(ToolsCallRequestSchema, {
    name: "assess",
    arguments: { signals },
  });

  console.log("=== tools/call assess ===");
  console.log(JSON.stringify(out, null, 2));

  await client.close();
}

main().catch((err) => {
  console.error("Smoke test failed:");
  console.error(err);
  process.exit(1);
});
