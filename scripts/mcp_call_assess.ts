import { spawn } from "node:child_process";

type JsonRpcReq = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: any;
};

type ToolCallResponse = {
  jsonrpc?: "2.0";
  id?: number;
  result?: {
    isError?: boolean;
    content?: Array<{ type: "text"; text: string }>;
  };
  error?: any;
};

function runOnce(req: JsonRpcReq): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dist/server.js"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let out = "";
    let err = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));

    child.on("error", reject);

    child.stdin.write(JSON.stringify(req) + "\n");
    child.stdin.end();

    child.on("close", (code) => {
      if (code !== 0 && !out.trim()) {
        return reject(new Error(`server exited code=${code}\n${err}`));
      }
      resolve(out.trim() || err.trim());
    });
  });
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function extractText(resp: ToolCallResponse): string {
  const t = resp?.result?.content?.[0]?.text;
  return typeof t === "string" ? t : "";
}

/**
 * 统一从返回文本中解析 assess 的 JSON payload：
 * - 格式 A：包含 "Full decision payload:"，其后是 JSON
 * - 格式 B：header + "\n\n" + JSON（ALLOW 场景常见）
 */
function extractPayloadJson(resp: ToolCallResponse): any | null {
  const text = extractText(resp).trim();
  if (!text) return null;

  const marker = "Full decision payload:";
  const idx = text.indexOf(marker);
  if (idx !== -1) {
    const jsonPart = text.slice(idx + marker.length).trim();
    return safeJsonParse<any>(jsonPart);
  }

  const brace = text.indexOf("{");
  if (brace !== -1) {
    const jsonPart = text.slice(brace).trim();
    return safeJsonParse<any>(jsonPart);
  }

  return null;
}

function extractReceipt(payload: any): { receipt_id: string; plan_hash: string } | null {
  const receipt = payload?.guardrail?.receipt;
  const receipt_id = receipt?.receipt_id;
  const plan_hash = receipt?.plan_hash;
  if (typeof receipt_id === "string" && typeof plan_hash === "string") {
    return { receipt_id, plan_hash };
  }
  return null;
}

function summarizeGuardrail(payload: any): string {
  const g = payload?.guardrail;
  if (!g) return "guardrail: <missing>";

  const action = g.action ?? "<unknown>";
  const reason = g.reason ?? "";
  const executed = typeof g.executed === "boolean" ? g.executed : "<unknown>";

  const receiptId = g?.receipt?.receipt_id ?? "";
  const planHash = g?.receipt?.plan_hash ?? "";

  const confirmedPlan = g?.confirmation?.confirmed_plan_hash ?? "";
  const confirmedReceipt = g?.confirmation?.confirmed_receipt_id ?? "";

  return [
    `guardrail.action: ${action}`,
    `executed: ${executed}`,
    reason ? `reason: ${reason}` : "",
    receiptId ? `receipt_id: ${receiptId}` : "",
    planHash ? `plan_hash: ${planHash}` : "",
    confirmedPlan ? `confirmed_plan_hash: ${confirmedPlan}` : "",
    confirmedReceipt ? `confirmed_receipt_id: ${confirmedReceipt}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function callAssess(args: any): Promise<ToolCallResponse> {
  const req: JsonRpcReq = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "assess",
      arguments: args,
    },
  };

  const raw = await runOnce(req);
  const parsed = safeJsonParse<ToolCallResponse>(raw);
  if (!parsed) {
    return { result: { isError: true, content: [{ type: "text", text: raw }] } };
  }
  return parsed;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function printSection(title: string, body: string) {
  console.log(`\n=== ${title} ===`);
  console.log(body);
}

async function main() {
  const auto = hasFlag("--auto");
  const signals = { files_touched: 10 };

  // PASS 1
  const resp1 = await callAssess({ signals });
  const text1 = extractText(resp1);
  printSection("PASS 1 (no confirm)", text1);

  const payload1 = extractPayloadJson(resp1);
  if (!payload1) {
    console.error("\n[error] PASS 1: cannot parse payload JSON from response text.");
    process.exit(1);
  }

  console.log("\n[summary]");
  console.log(summarizeGuardrail(payload1));

  const action1 = payload1?.guardrail?.action;

  if (action1 !== "REQUIRE_CONFIRM") {
    console.log("\n[info] Guardrail did not require confirmation; no pass 2 needed.");
    return;
  }

  const receipt = extractReceipt(payload1);
  if (!receipt) {
    console.error("\n[error] PASS 1: REQUIRE_CONFIRM but receipt missing.");
    process.exit(1);
  }

  console.log("\n[receipt] extracted");
  console.log(`- receipt_id: ${receipt.receipt_id}`);
  console.log(`- plan_hash : ${receipt.plan_hash}`);

  if (!auto) {
    console.log("\n[next] To confirm explicitly, re-run with:");
    console.log(
      JSON.stringify(
        {
          signals,
          confirm: { mode: "EXECUTE", receipt_id: receipt.receipt_id, plan_hash: receipt.plan_hash },
        },
        null,
        2
      )
    );
    console.log('\nTip: add "--auto" to let this script perform PASS 2 automatically.');
    return;
  }

  // PASS 2 (auto)
  const resp2 = await callAssess({
    signals,
    confirm: {
      mode: "EXECUTE",
      receipt_id: receipt.receipt_id,
      plan_hash: receipt.plan_hash,
    },
  });

  const text2 = extractText(resp2);
  printSection("PASS 2 (confirm EXECUTE) [--auto]", text2);

  const payload2 = extractPayloadJson(resp2);
  if (!payload2) {
    console.error("\n[error] PASS 2: cannot parse payload JSON from response text.");
    process.exit(1);
  }

  console.log("\n[summary]");
  console.log(summarizeGuardrail(payload2));

  const action2 = payload2?.guardrail?.action;
  if (action2 === "ALLOW") {
    console.log("\n[ok] Guardrail receipt EXECUTE accepted. Action allowed.");
  } else {
    console.log(`\n[warn] Expected guardrail.action=ALLOW but got: ${String(action2)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
