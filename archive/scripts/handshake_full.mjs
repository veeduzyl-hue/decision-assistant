import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";

const Any = z.any(); // ✅ 永远可 safeParse 的 schema

const cwd = process.cwd();

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/server.js"],
  cwd,
});

const client = new Client(
  { name: "decision-assistant-handshake-full", version: "0.1.0" },
  { capabilities: {} }
);

function pretty(title, obj) {
  console.log(`\n==== ${title} ====`);
  console.log(JSON.stringify(obj, null, 2));
}

function pickText(resp) {
  // 兼容不同 SDK 返回结构
  return (
    resp?.content?.[0]?.text ??
    resp?.result?.content?.[0]?.text ??
    "{}"
  );
}

async function main() {
  await client.connect(transport);

  // 0) tools/list（可选）
  const tools = await client.request(
    { method: "tools/list", params: {} },
    Any,
    { timeout: 60_000 }
  );
  pretty("tools/list", tools);

  // 1) detect_triggers
  const detectArgs = {
    signals: {
      refactor_days: 5,
      ship_gap_days: 5,
      refactor_commits_ratio: 0.72,
      todo_growth_ratio: 0.35,
      churn_ratio: 0.42,
    },
  };

  const detect = await client.request(
    {
      method: "tools/call",
      params: { name: "detect_triggers", arguments: detectArgs },
    },
    Any,
    { timeout: 60_000 }
  );
  pretty("tools/call detect_triggers", detect);

  let detected = {};
  try {
    detected = JSON.parse(pickText(detect));
  } catch {
    detected = { raw: pickText(detect) };
  }

  // 2) assess：优先 detect 输出，否则回退输入
  const signals =
    detected?.signals ??
    detected ??
    detectArgs.signals;

  const assess = await client.request(
    {
      method: "tools/call",
      params: { name: "assess", arguments: { signals } },
    },
    Any,
    { timeout: 60_000 }
  );
  pretty("tools/call assess", assess);

  let assessed = {};
  try {
    assessed = JSON.parse(pickText(assess));
  } catch {
    assessed = { raw: pickText(assess) };
  }

  const decisionObj =
    assessed?.decision?.decision
      ? assessed.decision
      : (assessed?.decision ?? {});

  // 3) plan
  const plan = await client.request(
    {
      method: "tools/call",
      params: { name: "plan", arguments: { decision: decisionObj } },
    },
    Any,
    { timeout: 60_000 }
  );
  pretty("tools/call plan", plan);

  // 4) followup
  const followup = await client.request(
    {
      method: "tools/call",
      params: { name: "followup", arguments: { decision: decisionObj } },
    },
    Any,
    { timeout: 60_000 }
  );
  pretty("tools/call followup", followup);

  await client.close();
  console.log("\nDONE. Exiting.");
}

main().catch((err) => {
  console.error("Handshake full failed:", err);
  process.exit(1);
});
