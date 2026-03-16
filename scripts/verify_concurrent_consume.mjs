import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

import { createSqlitePersistence } from "../dist/persistence/sqlite_store.js";

function makeTempDb() {
  const dir = mkdtempSync(join(tmpdir(), "decision-assistant-concurrent-"));
  return { dir, dbPath: join(dir, "runtime.sqlite") };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (!isMainThread) {
  const store = createSqlitePersistence(workerData.dbPath);
  try {
    const result = store.receipts.consumeReceipt({
      receipt_id: "gr_concurrent0001",
      plan_hash: "plan_concurrent001",
      nonce: "nonce_concurrent001",
      nowIso: workerData.nowIso,
    });
    parentPort.postMessage(result);
  } finally {
    store.close();
  }
} else {
  async function runWorker(dbPath, nowIso) {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: { dbPath, nowIso },
      });
      let message;
      let settled = false;
      worker.once("message", (value) => {
        message = value;
      });
      worker.once("error", (error) => {
        settled = true;
        reject(error);
      });
      worker.once("exit", (code) => {
        if (settled) {
          return;
        }
        settled = true;
        if (code !== 0) {
          reject(new Error(`worker exited with code=${code}`));
          return;
        }
        if (message === undefined) {
          reject(new Error("worker exited without posting a result"));
          return;
        }
        resolve(message);
      });
    });
  }

  async function main() {
    const temp = makeTempDb();
    const store = createSqlitePersistence(temp.dbPath);

    try {
      store.receipts.issueReceipt({
        receipt_id: "gr_concurrent0001",
        plan_hash: "plan_concurrent001",
        nonce: "nonce_concurrent001",
        scope: "this_call_only",
        issued_at: "2026-03-17T10:00:00Z",
        expires_at: "2026-03-17T10:05:00Z",
      });
      store.close();

      const [first, second] = await Promise.all([
        runWorker(temp.dbPath, "2026-03-17T10:01:00Z"),
        runWorker(temp.dbPath, "2026-03-17T10:01:00Z"),
      ]);

      const results = [first, second];
      const successes = results.filter((result) => result.ok === true);
      const failures = results.filter((result) => result.ok === false);

      assert.equal(successes.length, 1, "exactly one consume must succeed");
      assert.equal(failures.length, 1, "exactly one consume must fail");
      assert.equal(failures[0]?.error, "REPLAY_DETECTED", "losing consume must be rejected as replay");

      const reopened = createSqlitePersistence(temp.dbPath);
      try {
        assert.equal(
          reopened.replayIndex.hasExecutionKey("gr_concurrent0001:plan_concurrent001:nonce_concurrent001"),
          true
        );
      } finally {
        reopened.close();
      }

      console.log("[verify:concurrent-consume] OK");
    } finally {
      let lastError;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          rmSync(temp.dir, { recursive: true, force: true });
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          await sleep(25 * (attempt + 1));
        }
      }
      if (lastError) {
        throw lastError;
      }
    }
  }

  main().catch((error) => {
    console.error("[verify:concurrent-consume] FAIL");
    console.error(error);
    process.exit(1);
  });
}
