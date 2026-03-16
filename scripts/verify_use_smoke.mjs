import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { createSqlitePersistence } from "../dist/persistence/sqlite_store.js";

function runCommand(command, cwd, extraEnv = {}) {
  const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} failed`);
  }

  return result.stdout;
}

function createCacheDir() {
  return resolve(process.cwd(), ".decision_assistant", "npm-cache");
}

function packArtifact() {
  const output = runCommand("npm.cmd pack --json", process.cwd(), {
    npm_config_cache: createCacheDir(),
  });
  const parsed = JSON.parse(output);
  assert.equal(Array.isArray(parsed), true);
  return resolve(process.cwd(), parsed[0].filename);
}

function installTarball(tgzPath) {
  const tempDir = mkdtempSync(join(tmpdir(), "decision-assistant-use-smoke-"));
  const localTgz = join(tempDir, "decision-assistant.tgz");
  writeFileSync(
    join(tempDir, "package.json"),
    JSON.stringify({ name: "use-smoke", private: true, type: "module" }, null, 2)
  );
  copyFileSync(tgzPath, localTgz);

  runCommand(
    "npm.cmd install --no-package-lock --fund=false --audit=false .\\decision-assistant.tgz",
    tempDir,
    { npm_config_cache: createCacheDir() }
  );

  return tempDir;
}

class JsonRpcSession {
  constructor(command, args, env = {}, cwd) {
    this.child = spawn(command, args, {
      cwd,
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
      const message = `Server closed early. code=${code}\nstderr:\n${this.stderr}`;
      for (const pending of this.pending.values()) pending.reject(new Error(message));
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

function extractErrorPayload(text) {
  const marker = "Error payload:";
  const markerIndex = text.lastIndexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`No error payload found:\n${text}`);
  }
  return JSON.parse(text.slice(markerIndex + marker.length).trim());
}

async function main() {
  let tgzPath;
  let tempDir;
  let session;

  try {
    tgzPath = packArtifact();
    tempDir = installTarball(tgzPath);

    const pkgPath = join(tempDir, "node_modules", "decision-assistant", "package.json");
    assert.equal(existsSync(pkgPath), true);
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const binRel = pkg.bin["decision-assistant"];
    const binAbs = join(tempDir, "node_modules", "decision-assistant", ...binRel.split("/"));
    const dbPath = join(tempDir, "runtime.sqlite");

    session = new JsonRpcSession(process.execPath, [binAbs], { DA_SQLITE_PATH: dbPath }, tempDir);

    const invalid = await session.call(rpc(1, "assess", {}));
    assert.equal(invalid.result?.isError, true, "invalid input must return stable tool error");
    const invalidPayload = extractErrorPayload(toolText(invalid));
    assert.equal(invalidPayload.code, "INVALID_INPUT");

    const first = await session.call(rpc(2, "assess", { signals: { files_touched: 10 } }));
    const firstPayload = extractDecisionPayload(toolText(first));
    const receipt = firstPayload.guardrail?.receipt;
    assert.equal(firstPayload.guardrail?.action, "REQUIRE_CONFIRM");
    assert.equal(typeof receipt?.receipt_id, "string");
    assert.equal(typeof receipt?.plan_hash, "string");
    assert.equal(typeof receipt?.nonce, "string");

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
    const executePayload = extractDecisionPayload(toolText(execute));
    assert.equal(executePayload.guardrail?.action, "ALLOW");
    assert.equal(executePayload.guardrail?.executed, true);

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
    assert.equal(replayPayload.guardrail?.action, "REQUIRE_CONFIRM");
    assert.equal(replayPayload.guardrail?.confirmation?.error, "REPLAY_DETECTED");

    const store = createSqlitePersistence(dbPath);
    try {
      const events = store.decisionLogs.listAll();
      assert.equal(events.length >= 8, true, "decision log must append core flow evidence");
      assert.equal(events.some((event) => event.event_type === "receipt.issued"), true);
      assert.equal(events.some((event) => event.event_type === "receipt.consumed"), true);
      assert.equal(events.some((event) => event.event_type === "execute.accepted"), true);
      assert.equal(events.some((event) => event.event_type === "execute.rejected"), true);
    } finally {
      store.close();
    }

    console.log("[verify:use-smoke] OK");
  } finally {
    if (session) await session.close();
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    if (tgzPath && existsSync(tgzPath)) unlinkSync(tgzPath);
  }
}

main().catch((error) => {
  console.error("[verify:use-smoke] FAIL");
  console.error(error);
  process.exit(1);
});
