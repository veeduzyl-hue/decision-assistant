import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createSqlitePersistence } from "../dist/persistence/sqlite_store.js";

function loadJson(relPath) {
  return JSON.parse(readFileSync(resolve(process.cwd(), relPath), "utf8"));
}

class JsonRpcSession {
  constructor(dbPath) {
    this.child = spawn(process.execPath, ["dist/server.js"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "test", DA_SQLITE_PATH: dbPath },
    });
    this.buffer = "";
    this.pending = new Map();
    this.stderr = "";
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk) => (this.stderr += chunk));
  }

  onStdout(chunk) {
    this.buffer += chunk;
    while (true) {
      const nl = this.buffer.indexOf("\n");
      if (nl < 0) break;
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const pending = this.pending.get(msg.id);
      if (!pending) continue;
      this.pending.delete(msg.id);
      pending.resolve(msg);
    }
  }

  call(req) {
    return new Promise((resolve, reject) => {
      this.pending.set(req.id, { resolve, reject });
      this.child.stdin.write(JSON.stringify(req) + "\n");
    });
  }

  close() {
    return new Promise((resolve) => {
      this.child.once("close", () => resolve());
      this.child.stdin.end();
      this.child.kill();
    });
  }
}

function extractDecisionPayloadFromText(text) {
  const marker = "Full decision payload:";
  const idx = text.lastIndexOf(marker);
  if (idx >= 0) return JSON.parse(text.slice(idx + marker.length).trim());
  const firstBrace = text.indexOf("{");
  if (firstBrace >= 0) return JSON.parse(text.slice(firstBrace).trim());
  throw new Error(`No JSON payload found in content text:\n${text}`);
}

function toolText(resp) {
  const txt = resp.result?.content?.[0]?.text;
  if (typeof txt !== "string") throw new Error(`Unexpected tool result shape: ${JSON.stringify(resp)}`);
  return txt;
}

function assertEventSequence(events, expected, label) {
  assert.deepEqual(
    events.map((event) => event.event_type),
    expected,
    `${label} event sequence mismatch`
  );
}

const ajv = new Ajv2020({ allErrors: true, strict: false });

async function main() {
  const tempDir = mkdtempSync(join(tmpdir(), "decision-assistant-logs-"));
  const dbPath = join(tempDir, "runtime.sqlite");
  const session = new JsonRpcSession(dbPath);
  try {
    const assessResp = await session.call({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "assess", arguments: { signals: { files_touched: 10 } } },
    });
    const assessPayload = extractDecisionPayloadFromText(toolText(assessResp));
    const receipt = assessPayload.guardrail.receipt;

    const execResp = await session.call({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "assess",
        arguments: {
          signals: { files_touched: 10 },
          confirm: {
            mode: "EXECUTE",
            receipt_id: receipt.receipt_id,
            plan_hash: receipt.plan_hash,
            nonce: receipt.nonce,
          },
        },
      },
    });
    extractDecisionPayloadFromText(toolText(execResp));

    const replayResp = await session.call({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "assess",
        arguments: {
          signals: { files_touched: 10 },
          confirm: {
            mode: "EXECUTE",
            receipt_id: receipt.receipt_id,
            plan_hash: receipt.plan_hash,
            nonce: receipt.nonce,
          },
        },
      },
    });
    const replayPayload = extractDecisionPayloadFromText(toolText(replayResp));
    const replacementReceipt = replayPayload.guardrail?.receipt;
    assert.notEqual(replacementReceipt?.receipt_id, receipt.receipt_id);
    assert.notEqual(replacementReceipt?.nonce, receipt.nonce);

    const store = createSqlitePersistence(dbPath);
    try {
      const schema = loadJson("config/schema/decision-log.schema.json");
      const validate = ajv.compile(schema);
      const allEvents = store.decisionLogs.listAll();

      assert.equal(allEvents.length, 8, "expected append-only evidence for assess, execute, and replay reject");
      for (const event of allEvents) {
        assert.equal(validate(event), true, ajv.errorsText(validate.errors));
      }

      assertEventSequence(allEvents.slice(0, 2), [
        "decision.assessed",
        "receipt.issued",
      ], "initial assess");
      assertEventSequence(allEvents.slice(2, 5), [
        "decision.assessed",
        "receipt.consumed",
        "execute.accepted",
      ], "execute accepted");
      assertEventSequence(allEvents.slice(5, 8), [
        "decision.assessed",
        "execute.rejected",
        allEvents[7]?.event_type,
      ], "execute rejected");
      assert.equal(
        allEvents[7]?.event_type === "receipt.issued" ||
          allEvents[7]?.event_type === "receipt.reused",
        true,
        "rejected execute should leave replacement receipt evidence"
      );
      assert.equal(allEvents[1]?.receipt_id, receipt.receipt_id);
      assert.equal(allEvents[1]?.plan_hash, receipt.plan_hash);
      assert.equal(allEvents[4]?.receipt_id, receipt.receipt_id);
      assert.equal(allEvents[4]?.plan_hash, receipt.plan_hash);
      assert.equal(allEvents[4]?.nonce, receipt.nonce);
      assert.equal(allEvents[6]?.receipt_id, receipt.receipt_id);
      assert.equal(allEvents[6]?.plan_hash, receipt.plan_hash);
      assert.equal(allEvents[6]?.nonce, receipt.nonce);
      assert.equal(allEvents[7]?.receipt_id, replacementReceipt?.receipt_id);
      assert.equal(allEvents[7]?.plan_hash, replacementReceipt?.plan_hash);
      assert.equal(allEvents[7]?.nonce, replacementReceipt?.nonce);
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
