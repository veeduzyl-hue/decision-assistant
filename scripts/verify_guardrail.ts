import { spawn } from "node:child_process";
import assert from "node:assert/strict";

type JsonRpcReq = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: any;
};

type JsonRpcResp = {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: any;
};

function runOnce(req: JsonRpcReq): Promise<JsonRpcResp> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dist/server.js"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "test" },
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
      const text = out.trim();
      if (!text) {
        return reject(
          new Error(`No stdout from server. code=${code}\nstderr:\n${err}`)
        );
      }

      try {
        resolve(JSON.parse(text) as JsonRpcResp);
      } catch (e) {
        reject(
          new Error(
            `Failed to parse JSON-RPC stdout.\nstdout:\n${text}\n\nstderr:\n${err}`
          )
        );
      }
    });
  });
}

/**
 * Server returns MCP ToolsCallResult: { content: [{type:"text", text: "..."}], isError?: boolean }
 * Our assess tool often embeds JSON in the text (sometimes prefixed by human header).
 * This extracts the JSON payload reliably.
 */
function extractDecisionPayloadFromText(text: string): any {
  // 1) If it includes "Full decision payload:", parse everything after it.
  const marker = "Full decision payload:";
  const idx = text.lastIndexOf(marker);
  if (idx >= 0) {
    const after = text.slice(idx + marker.length).trim();
    return JSON.parse(after);
  }

  // 2) Otherwise, find first "{" and parse from there (handles "[confirmed]...\n\n{...}")
  const firstBrace = text.indexOf("{");
  if (firstBrace >= 0) {
    const jsonPart = text.slice(firstBrace).trim();
    return JSON.parse(jsonPart);
  }

  throw new Error(`No JSON payload found in content text:\n${text}`);
}

function toolText(resp: JsonRpcResp): string {
  if (resp.error) {
    throw new Error(`JSON-RPC error: ${JSON.stringify(resp.error, null, 2)}`);
  }
  const txt = resp.result?.content?.[0]?.text;
  if (typeof txt !== "string") {
    throw new Error(`Unexpected tool result shape: ${JSON.stringify(resp, null, 2)}`);
  }
  return txt;
}

async function main() {
  // PASS 1: expect REQUIRE_CONFIRM + receipt
  const pass1 = await runOnce({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "assess",
      arguments: { signals: { files_touched: 10 } },
    },
  });

  const pass1Text = toolText(pass1);
  const pass1Payload = extractDecisionPayloadFromText(pass1Text);

  const g1 = pass1Payload?.guardrail;
  assert(g1, "PASS1: guardrail must exist");
  assert.equal(g1.action, "REQUIRE_CONFIRM", "PASS1: guardrail.action must be REQUIRE_CONFIRM");
  assert.equal(g1.executed, false, "PASS1: guardrail.executed must be false");
  assert.equal(g1.confirmation?.required, true, "PASS1: confirmation.required must be true");

  const r1 = g1.receipt;
  assert(r1, "PASS1: guardrail.receipt must exist");
  assert(typeof r1.receipt_id === "string" && r1.receipt_id.startsWith("gr_"), "PASS1: receipt_id must start with gr_");
  assert(typeof r1.plan_hash === "string" && r1.plan_hash.startsWith("plan_"), "PASS1: plan_hash must start with plan_");
  assert.equal(r1.scope, "this_call_only", "PASS1: receipt.scope must be this_call_only");

  // PASS 2: confirm EXECUTE with PASS1 receipt
  const pass2 = await runOnce({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "assess",
      arguments: {
        signals: { files_touched: 10 },
        confirm: {
          mode: "EXECUTE",
          receipt_id: r1.receipt_id,
          plan_hash: r1.plan_hash,
        },
      },
    },
  });

  const pass2Text = toolText(pass2);
  const pass2Payload = extractDecisionPayloadFromText(pass2Text);

  const g2 = pass2Payload?.guardrail;
  assert(g2, "PASS2: guardrail must exist");
  assert.equal(g2.action, "ALLOW", "PASS2: guardrail.action must be ALLOW");
  assert.equal(g2.executed, true, "PASS2: guardrail.executed must be true");

  const r2 = g2.receipt;
  assert(r2, "PASS2: guardrail.receipt must exist");
  // 关键协议断言：放行后 receipt 要对齐（你当前实现是复用用户签收的 receipt_id）
  assert.equal(r2.receipt_id, r1.receipt_id, "PASS2: receipt_id must equal PASS1 receipt_id");
  assert.equal(r2.plan_hash, r1.plan_hash, "PASS2: plan_hash must equal PASS1 plan_hash");

  const c2 = g2.confirmation;
  assert(c2, "PASS2: guardrail.confirmation must exist");
  assert.equal(c2.required, false, "PASS2: confirmation.required must be false");
  assert.equal(c2.confirmed, true, "PASS2: confirmation.confirmed must be true");
  assert.equal(c2.confirmed_plan_hash, r1.plan_hash, "PASS2: confirmed_plan_hash must match");
  assert.equal(c2.confirmed_receipt_id, r1.receipt_id, "PASS2: confirmed_receipt_id must match");

  // 如果到这里都通过，输出一个非常短的成功标记（CI 友好）
  console.log("[smoke:guardrail] OK");
}

main().catch((e) => {
  console.error("[smoke:guardrail] FAIL");
  console.error(e);
  process.exit(1);
});
