import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import assert from "node:assert/strict";

type JsonRpcReq = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
};

type JsonRpcResp = {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: any;
};

class JsonRpcSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private buffer = "";
  private readonly pending = new Map<number, { resolve: (resp: JsonRpcResp) => void; reject: (e: Error) => void }>();
  private stderr = "";

  constructor() {
    this.child = spawn(process.execPath, ["dist/server.js"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "test" },
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk) => (this.stderr += chunk));
    this.child.on("error", (err) => {
      for (const { reject } of this.pending.values()) reject(err as Error);
      this.pending.clear();
    });
    this.child.on("close", (code) => {
      if (this.pending.size === 0) return;
      const msg = `Server closed early. code=${code}\nstderr:\n${this.stderr}`;
      for (const { reject } of this.pending.values()) reject(new Error(msg));
      this.pending.clear();
    });
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    while (true) {
      const nl = this.buffer.indexOf("\n");
      if (nl < 0) break;
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let msg: JsonRpcResp;
      try {
        msg = JSON.parse(line) as JsonRpcResp;
      } catch {
        continue;
      }
      const p = this.pending.get(msg.id);
      if (!p) continue;
      this.pending.delete(msg.id);
      p.resolve(msg);
    }
  }

  call(req: JsonRpcReq): Promise<JsonRpcResp> {
    return new Promise((resolve, reject) => {
      this.pending.set(req.id, { resolve, reject });
      this.child.stdin.write(JSON.stringify(req) + "\n");
    });
  }

  close(): void {
    this.child.stdin.end();
    this.child.kill();
  }
}

/**
 * Server returns MCP ToolsCallResult: { content: [{type:"text", text: "..."}], isError?: boolean }
 * Our assess tool often embeds JSON in the text (sometimes prefixed by human header).
 * This extracts the JSON payload reliably.
 */
function extractDecisionPayloadFromText(text: string): any {
  const marker = "Full decision payload:";
  const idx = text.lastIndexOf(marker);
  if (idx >= 0) {
    const after = text.slice(idx + marker.length).trim();
    return JSON.parse(after);
  }

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
  const session = new JsonRpcSession();
  try {
    const pass1 = await session.call({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "assess",
        arguments: { signals: { files_touched: 10 } },
      },
    });

    const pass1Payload = extractDecisionPayloadFromText(toolText(pass1));
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

    const pass2 = await session.call({
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

    const pass2Payload = extractDecisionPayloadFromText(toolText(pass2));
    const g2 = pass2Payload?.guardrail;
    assert(g2, "PASS2: guardrail must exist");
    assert.equal(g2.action, "ALLOW", "PASS2: guardrail.action must be ALLOW");
    assert.equal(g2.executed, true, "PASS2: guardrail.executed must be true");

    const r2 = g2.receipt;
    assert(r2, "PASS2: guardrail.receipt must exist");
    assert.equal(r2.receipt_id, r1.receipt_id, "PASS2: receipt_id must equal PASS1 receipt_id");
    assert.equal(r2.plan_hash, r1.plan_hash, "PASS2: plan_hash must equal PASS1 plan_hash");

    const c2 = g2.confirmation;
    assert(c2, "PASS2: guardrail.confirmation must exist");
    assert.equal(c2.required, false, "PASS2: confirmation.required must be false");
    assert.equal(c2.confirmed, true, "PASS2: confirmation.confirmed must be true");
    assert.equal(c2.confirmed_plan_hash, r1.plan_hash, "PASS2: confirmed_plan_hash must match");
    assert.equal(c2.confirmed_receipt_id, r1.receipt_id, "PASS2: confirmed_receipt_id must match");

    // PASS 3: idempotent replay should still ALLOW and keep same receipt.
    const pass3 = await session.call({
      jsonrpc: "2.0",
      id: 3,
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
    const pass3Payload = extractDecisionPayloadFromText(toolText(pass3));
    const g3 = pass3Payload?.guardrail;
    assert(g3, "PASS3: guardrail must exist");
    assert.equal(g3.action, "ALLOW", "PASS3: replay guardrail.action must be ALLOW");
    assert.equal(g3.executed, true, "PASS3: replay guardrail.executed must be true");
    assert.equal(g3.already_executed, true, "PASS3: replay guardrail.already_executed must be true");
    assert.equal(g3?.receipt?.receipt_id, r1.receipt_id, "PASS3: replay receipt_id must remain stable");

    console.log("[smoke:guardrail] OK");
  } finally {
    session.close();
  }
}

main().catch((e) => {
  console.error("[smoke:guardrail] FAIL");
  console.error(e);
  process.exit(1);
});
