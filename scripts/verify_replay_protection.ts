import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildExecutionKey, createSqlitePersistence } from "../src/persistence/sqlite_store.js";

function makeTempDb(): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "decision-assistant-replay-"));
  return { dir, dbPath: join(dir, "runtime.sqlite") };
}

function main(): void {
  const temp = makeTempDb();
  const firstStore = createSqlitePersistence(temp.dbPath);
  const secondStore = createSqlitePersistence(temp.dbPath);

  try {
    firstStore.receipts.issueReceipt({
      receipt_id: "gr_replay000001",
      plan_hash: "plan_replay0001",
      nonce: "nonce_replay0001",
      scope: "this_call_only",
      issued_at: "2026-03-16T10:00:00Z",
      expires_at: "2026-03-16T10:05:00Z",
    });

    const first = firstStore.receipts.consumeReceipt({
      receipt_id: "gr_replay000001",
      plan_hash: "plan_replay0001",
      nonce: "nonce_replay0001",
      nowIso: "2026-03-16T10:01:00Z",
    });
    assert.equal(first.ok, true, "first consume must succeed");

    const executionKey = buildExecutionKey("gr_replay000001", "plan_replay0001", "nonce_replay0001");
    assert.equal(secondStore.replayIndex.hasExecutionKey(executionKey), true, "replay index must persist execution keys");

    const replay = secondStore.receipts.consumeReceipt({
      receipt_id: "gr_replay000001",
      plan_hash: "plan_replay0001",
      nonce: "nonce_replay0001",
      nowIso: "2026-03-16T10:01:01Z",
    });
    assert.equal(replay.ok, false, "duplicate execute must fail");
    assert.equal(replay.error, "REPLAY_DETECTED");

    const alternateNonce = secondStore.receipts.consumeReceipt({
      receipt_id: "gr_replay000001",
      plan_hash: "plan_replay0001",
      nonce: "nonce_replay9999",
      nowIso: "2026-03-16T10:01:02Z",
    });
    assert.equal(alternateNonce.ok, false, "consumed receipt must not execute again");
    assert.equal(alternateNonce.error, "RECEIPT_CONSUMED");

    const reopened = createSqlitePersistence(temp.dbPath);
    try {
      assert.equal(reopened.replayIndex.hasExecutionKey(executionKey), true, "replay evidence must survive restart");
      const replayAfterRestart = reopened.receipts.consumeReceipt({
        receipt_id: "gr_replay000001",
        plan_hash: "plan_replay0001",
        nonce: "nonce_replay0001",
        nowIso: "2026-03-16T10:01:03Z",
      });
      assert.equal(replayAfterRestart.ok, false);
      assert.equal(replayAfterRestart.error, "REPLAY_DETECTED");
    } finally {
      reopened.close();
    }

    console.log("[verify:replay-protection] OK");
  } finally {
    firstStore.close();
    secondStore.close();
    rmSync(temp.dir, { recursive: true, force: true });
  }
}

main();
