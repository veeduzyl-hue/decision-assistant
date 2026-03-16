import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createSqlitePersistence } from "../src/persistence/sqlite_store.js";

function makeTempDb(): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "decision-assistant-receipts-"));
  return { dir, dbPath: join(dir, "runtime.sqlite") };
}

function main(): void {
  const temp = makeTempDb();
  const store = createSqlitePersistence(temp.dbPath);

  try {
    assert.deepEqual(store.receipts.getReceiptState("gr_missing000001", "2026-03-16T10:00:00Z"), {
      status: "missing",
    });

    store.receipts.issueReceipt({
      receipt_id: "gr_active000001",
      plan_hash: "plan_active0001",
      nonce: "nonce_active0001",
      scope: "this_call_only",
      issued_at: "2026-03-16T10:00:00Z",
      expires_at: "2026-03-16T10:05:00Z",
    });

    const active = store.receipts.findActiveReceiptByPlanHash("plan_active0001", "2026-03-16T10:01:00Z");
    assert.equal(active?.receipt_id, "gr_active000001");
    assert.deepEqual(store.receipts.getReceiptState("gr_active000001", "2026-03-16T10:01:00Z"), {
      status: "active",
      plan_hash: "plan_active0001",
      nonce: "nonce_active0001",
      scope: "this_call_only",
      expires_at: "2026-03-16T10:05:00Z",
      expired: false,
    });
    assert.equal(
      store.receipts.findActiveReceiptByPlanHash("plan_active0001", "2026-03-16T10:06:00Z"),
      null,
      "expired receipts must not be returned as active"
    );
    assert.deepEqual(store.receipts.getReceiptState("gr_active000001", "2026-03-16T10:06:00Z"), {
      status: "active",
      plan_hash: "plan_active0001",
      nonce: "nonce_active0001",
      scope: "this_call_only",
      expires_at: "2026-03-16T10:05:00Z",
      expired: true,
    });

    store.receipts.issueReceipt({
      receipt_id: "gr_expired000001",
      plan_hash: "plan_expired001",
      nonce: "nonce_expired001",
      scope: "this_call_only",
      issued_at: "2026-03-16T10:00:00Z",
      expires_at: "2026-03-16T10:00:30Z",
    });

    const expiredConsume = store.receipts.consumeReceipt({
      receipt_id: "gr_expired000001",
      plan_hash: "plan_expired001",
      nonce: "nonce_expired001",
      nowIso: "2026-03-16T10:02:00Z",
    });
    assert.equal(expiredConsume.ok, false);
    assert.equal(expiredConsume.error, "RECEIPT_EXPIRED");

    store.receipts.issueReceipt({
      receipt_id: "gr_consumed00001",
      plan_hash: "plan_consumed01",
      nonce: "nonce_consumed01",
      scope: "this_call_only",
      issued_at: "2026-03-16T10:00:00Z",
      expires_at: "2026-03-16T10:05:00Z",
    });

    const consumed = store.receipts.consumeReceipt({
      receipt_id: "gr_consumed00001",
      plan_hash: "plan_consumed01",
      nonce: "nonce_consumed01",
      nowIso: "2026-03-16T10:01:00Z",
    });
    assert.equal(consumed.ok, true);

    const reopened = createSqlitePersistence(temp.dbPath);
    try {
      assert.deepEqual(reopened.receipts.getReceiptState("gr_consumed00001", "2026-03-16T10:01:01Z"), {
        status: "consumed",
        plan_hash: "plan_consumed01",
        nonce: "nonce_consumed01",
        scope: "this_call_only",
        consumed_at: "2026-03-16T10:01:00Z",
      });
    } finally {
      reopened.close();
    }

    console.log("[verify:receipt-lifecycle] OK");
  } finally {
    store.close();
    rmSync(temp.dir, { recursive: true, force: true });
  }
}

main();
