import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import Ajv2020 from "ajv/dist/2020.js";

import { createSqlitePersistence } from "../dist/persistence/sqlite_store.js";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  error?: unknown;
};

class JsonRpcSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private buffer = "";
  private readonly pending = new Map<
    number,
    { resolve: (response: JsonRpcResponse) => void; reject: (error: Error) => void }
  >();
  private stderr = "";

  constructor(dbPath: string) {
    this.child = spawn(process.execPath, ["dist/server.js"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "test", DA_SQLITE_PATH: dbPath },
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    this.child.on("error", (error) => {
      for (const pending of this.pending.values()) pending.reject(error as Error);
      this.pending.clear();
    });
    this.child.on("close", (code) => {
      if (this.pending.size === 0) return;
      const message = `Server closed early. code=${code}\nstderr:\n${this.stderr}`;
      for (const pending of this.pending.values()) pending.reject(new Error(message));
      this.pending.clear();
    });
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    while (true) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) return;

      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;

      let message: JsonRpcResponse;
      try {
        message = JSON.parse(line) as JsonRpcResponse;
      } catch {
        continue;
      }

      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      pending.resolve(message);
    }
  }

  call(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify(request)}\n`);
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.child.once("close", () => resolve());
      this.child.stdin.end();
      this.child.kill();
    });
  }
}

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

function toolText(response: JsonRpcResponse): string {
  if (response.error) {
    throw new Error(`Unexpected JSON-RPC error: ${JSON.stringify(response.error)}`);
  }

  const text = response.result?.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error(`Unexpected tool result shape: ${JSON.stringify(response)}`);
  }
  return text;
}

function extractDecisionPayload(text: string): any {
  const marker = "Full decision payload:";
  const markerIndex = text.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return JSON.parse(text.slice(markerIndex + marker.length).trim());
  }

  const firstBrace = text.indexOf("{");
  if (firstBrace >= 0) {
    return JSON.parse(text.slice(firstBrace).trim());
  }

  throw new Error(`No JSON payload found in tool response:\n${text}`);
}

function mainlineRequest(id: number, args: unknown): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: {
      name: "assess",
      arguments: args,
    },
  };
}

async function main(): Promise<void> {
  const tempDir = mkdtempSync(join(tmpdir(), "decision-assistant-audit-"));
  const dbPath = join(tempDir, "runtime.sqlite");
  const session = new JsonRpcSession(dbPath);
  const ajv = new Ajv2020({ allErrors: true, strict: false });

  try {
    const assessText = toolText(
      await session.call(mainlineRequest(1, { signals: { files_touched: 10, diff_lines_total: 100 } }))
    );
    const assessPayload = extractDecisionPayload(assessText);
    const firstReceipt = assessPayload.guardrail?.receipt;
    assert.equal(typeof firstReceipt?.receipt_id, "string");
    assert.equal(typeof firstReceipt?.plan_hash, "string");
    assert.equal(typeof firstReceipt?.nonce, "string");

    const executeText = toolText(
      await session.call(
        mainlineRequest(2, {
          signals: { files_touched: 10, diff_lines_total: 100 },
          confirm: {
            mode: "EXECUTE",
            receipt_id: firstReceipt.receipt_id,
            plan_hash: firstReceipt.plan_hash,
            nonce: firstReceipt.nonce,
          },
        })
      )
    );
    extractDecisionPayload(executeText);

    const replayText = toolText(
      await session.call(
        mainlineRequest(3, {
          signals: { files_touched: 10, diff_lines_total: 100 },
          confirm: {
            mode: "EXECUTE",
            receipt_id: firstReceipt.receipt_id,
            plan_hash: firstReceipt.plan_hash,
            nonce: firstReceipt.nonce,
          },
        })
      )
    );
    const replayPayload = extractDecisionPayload(replayText);
    const replacementReceipt = replayPayload.guardrail?.receipt;
    assert.notEqual(replacementReceipt?.receipt_id, firstReceipt.receipt_id);
    assert.notEqual(replacementReceipt?.nonce, firstReceipt.nonce);

    const schema = loadJson("config/schema/decision-log.schema.json");
    const validate = ajv.compile(schema);

    const store = createSqlitePersistence(dbPath);
    try {
      const events = store.decisionLogs.listAll();
      assert.equal(events.length, 8, "expected append-only log evidence for mainline flow");

      for (const event of events) {
        assert.equal(validate(event), true, ajv.errorsText(validate.errors));
      }

      assert.deepEqual(
        events.map((event) => event.event_type),
        [
          "decision.assessed",
          "receipt.issued",
          "decision.assessed",
          "receipt.consumed",
          "execute.accepted",
          "decision.assessed",
          "execute.rejected",
          "receipt.issued",
        ],
        "mainline log sequence must remain append-only and reviewable"
      );

      assert.equal(events[1]?.receipt_id, firstReceipt.receipt_id);
      assert.equal(events[4]?.receipt_id, firstReceipt.receipt_id);
      assert.equal(events[6]?.receipt_id, firstReceipt.receipt_id);
      assert.equal(events[7]?.receipt_id, replacementReceipt?.receipt_id);
    } finally {
      store.close();
    }

    console.log("[verify:decision-logs] OK");
  } finally {
    await session.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("[verify:decision-logs] FAIL");
  console.error(error);
  process.exit(1);
});
