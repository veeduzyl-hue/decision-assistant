import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createErrorPayload,
  toUnknownErrorPayload,
} from "../dist/runtime/error_semantics.js";

class JsonRpcSession {
  constructor(env = {}) {
    this.child = spawn(process.execPath, ["dist/server.js"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "test", ...env },
    });
    this.buffer = "";
    this.pending = new Map();
    this.stderr = "";

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    this.child.on("error", (error) => {
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
    this.child.on("close", (code) => {
      if (this.pending.size === 0) return;
      const error = new Error(`Server closed early. code=${code}\nstderr:\n${this.stderr}`);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
  }

  onStdout(chunk) {
    this.buffer += chunk;
    while (true) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) return;

      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;

      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }

      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      pending.resolve(message);
    }
  }

  call(request) {
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify(request)}\n`);
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

function toolText(response) {
  if (response.error) {
    throw new Error(`Unexpected JSON-RPC error: ${JSON.stringify(response.error)}`);
  }

  const text = response.result?.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error(`Unexpected tool result shape: ${JSON.stringify(response)}`);
  }
  return text;
}

function extractErrorPayload(text) {
  const marker = "Error payload:";
  const markerIndex = text.lastIndexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`No error payload found:\n${text}`);
  }
  return JSON.parse(text.slice(markerIndex + marker.length).trim());
}

function extractDecisionPayload(text) {
  const marker = "Full decision payload:";
  const markerIndex = text.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return JSON.parse(text.slice(markerIndex + marker.length).trim());
  }

  const firstBrace = text.indexOf("{");
  if (firstBrace >= 0) {
    return JSON.parse(text.slice(firstBrace).trim());
  }

  throw new Error(`No decision payload found:\n${text}`);
}

function rpc(id, name, args) {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: {
      name,
      arguments: args,
    },
  };
}

async function verifyToolErrors() {
  const tempDir = mkdtempSync(join(tmpdir(), "decision-assistant-errors-"));
  const dbPath = join(tempDir, "runtime.sqlite");
  const session = new JsonRpcSession({ DA_SQLITE_PATH: dbPath });

  try {
    const invalidInput = await session.call(rpc(1, "assess", {}));
    assert.equal(invalidInput.result?.isError, true);
    const invalidInputPayload = extractErrorPayload(toolText(invalidInput));
    assert.equal(invalidInputPayload.code, "INVALID_INPUT");
    assert.equal(invalidInputPayload.schema_version, "decision-assistant/error/v1");

    const first = await session.call(rpc(2, "assess", { signals: { files_touched: 10 } }));
    const firstPayload = extractDecisionPayload(toolText(first));
    const receipt = firstPayload.guardrail?.receipt;
    assert.equal(typeof receipt?.receipt_id, "string");

    const execute = await session.call(
      rpc(3, "assess", {
        signals: { files_touched: 10 },
        confirm: {
          mode: "EXECUTE",
          receipt_id: receipt.receipt_id,
          plan_hash: receipt.plan_hash,
          nonce: receipt.nonce,
        },
      })
    );
    extractDecisionPayload(toolText(execute));

    const replay = await session.call(
      rpc(4, "assess", {
        signals: { files_touched: 10 },
        confirm: {
          mode: "EXECUTE",
          receipt_id: receipt.receipt_id,
          plan_hash: receipt.plan_hash,
          nonce: receipt.nonce,
        },
      })
    );
    const replayPayload = extractDecisionPayload(toolText(replay));
    assert.equal(replayPayload.guardrail?.confirmation?.error, "REPLAY_DETECTED");

    const unknownTool = await session.call(rpc(5, "no_such_tool", {}));
    assert.equal(unknownTool.result?.isError, true);
    const unknownToolPayload = extractErrorPayload(toolText(unknownTool));
    assert.equal(unknownToolPayload.code, "UNKNOWN_TOOL");
  } finally {
    await session.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function verifyPersistenceFailureExit() {
  const tempDir = mkdtempSync(join(tmpdir(), "decision-assistant-errors-db-"));
  const badPath = join(tempDir, "occupied");
  mkdirSync(badPath, { recursive: true });

  const child = spawn(process.execPath, ["dist/server.js"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "test", DA_SQLITE_PATH: badPath },
  });

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  try {
    assert.equal(code, 2, "fatal persistence failure must exit with code 2");
    const lines = stderr
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const payload = JSON.parse(lines.at(-1));
    assert.equal(payload.code, "PERSISTENCE_FAILURE");
    assert.equal(payload.schema_version, "decision-assistant/error/v1");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function verifyFallbackMapping() {
  const explicit = createErrorPayload({
    code: "INVALID_INPUT",
    message: "signals parameter is required",
  });
  assert.equal(explicit.code, "INVALID_INPUT");
  assert.equal(explicit.schema_version, "decision-assistant/error/v1");

  const fallback = toUnknownErrorPayload(new Error("boom"));
  assert.equal(fallback.code, "INTERNAL_ERROR");
  assert.equal(fallback.schema_version, "decision-assistant/error/v1");
}

async function main() {
  verifyFallbackMapping();
  await verifyToolErrors();
  await verifyPersistenceFailureExit();
  console.log("[verify:error-semantics] OK");
}

main().catch((error) => {
  console.error("[verify:error-semantics] FAIL");
  console.error(error);
  process.exit(1);
});
