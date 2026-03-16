import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createSqlitePersistence } from "../dist/persistence/sqlite_store.js";

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "decision-assistant-sqlite-"));
  return {
    dir,
    dbPath: join(dir, "runtime.sqlite"),
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("creates and finds active receipts", () => {
  const temp = makeDbPath();
  const store = createSqlitePersistence(temp.dbPath);
  try {
    const issued = store.receipts.issueReceipt({
      receipt_id: "gr_aaaaaaaaaaaa",
      plan_hash: "plan_bbbbbbbbbbbb",
      nonce: "nonce_cccccccccccc",
      scope: "this_call_only",
      issued_at: "2026-03-16T10:00:00Z",
      expires_at: "2026-03-16T10:05:00Z",
    });

    const found = store.receipts.findActiveReceiptByPlanHash("plan_bbbbbbbbbbbb", "2026-03-16T10:01:00Z");
    const state = store.receipts.getReceiptState("gr_aaaaaaaaaaaa", "2026-03-16T10:01:00Z");

    assert.equal(issued.status, "active");
    assert.equal(found?.receipt_id, "gr_aaaaaaaaaaaa");
    assert.equal(found?.nonce, "nonce_cccccccccccc");
    assert.deepEqual(state, {
      status: "active",
      plan_hash: "plan_bbbbbbbbbbbb",
      nonce: "nonce_cccccccccccc",
      scope: "this_call_only",
      expires_at: "2026-03-16T10:05:00Z",
      expired: false,
    });
  } finally {
    store.close();
    temp.cleanup();
  }
});

test("consumes a receipt only once", () => {
  const temp = makeDbPath();
  const store = createSqlitePersistence(temp.dbPath);
  try {
    store.receipts.issueReceipt({
      receipt_id: "gr_111111111111",
      plan_hash: "plan_222222222222",
      nonce: "nonce_333333333333",
      scope: "this_call_only",
      issued_at: "2026-03-16T10:00:00Z",
      expires_at: "2026-03-16T10:05:00Z",
    });

    const result = store.receipts.consumeReceipt({
      receipt_id: "gr_111111111111",
      plan_hash: "plan_222222222222",
      nonce: "nonce_333333333333",
      nowIso: "2026-03-16T10:01:00Z",
    });

    const state = store.receipts.getReceiptState("gr_111111111111", "2026-03-16T10:01:01Z");

    assert.equal(result.ok, true);
    assert.deepEqual(state, {
      status: "consumed",
      plan_hash: "plan_222222222222",
      nonce: "nonce_333333333333",
      scope: "this_call_only",
      consumed_at: "2026-03-16T10:01:00Z",
    });
  } finally {
    store.close();
    temp.cleanup();
  }
});

test("rejects replay for the same execution key", () => {
  const temp = makeDbPath();
  const store = createSqlitePersistence(temp.dbPath);
  try {
    store.receipts.issueReceipt({
      receipt_id: "gr_deadbeefcafe",
      plan_hash: "plan_feedfacecafe",
      nonce: "nonce_123456789abc",
      scope: "this_call_only",
      issued_at: "2026-03-16T10:00:00Z",
      expires_at: "2026-03-16T10:05:00Z",
    });

    const first = store.receipts.consumeReceipt({
      receipt_id: "gr_deadbeefcafe",
      plan_hash: "plan_feedfacecafe",
      nonce: "nonce_123456789abc",
      nowIso: "2026-03-16T10:01:00Z",
    });
    const second = store.receipts.consumeReceipt({
      receipt_id: "gr_deadbeefcafe",
      plan_hash: "plan_feedfacecafe",
      nonce: "nonce_123456789abc",
      nowIso: "2026-03-16T10:01:01Z",
    });

    assert.equal(first.ok, true);
    assert.deepEqual(second, {
      ok: false,
      error: "REPLAY_DETECTED",
      receipt: {
        receipt_id: "gr_deadbeefcafe",
        plan_hash: "plan_feedfacecafe",
        nonce: "nonce_123456789abc",
        scope: "this_call_only",
        status: "consumed",
        issued_at: "2026-03-16T10:00:00Z",
        expires_at: "2026-03-16T10:05:00Z",
        consumed_at: "2026-03-16T10:01:00Z",
      },
    });
  } finally {
    store.close();
    temp.cleanup();
  }
});

test("rejects expired receipts", () => {
  const temp = makeDbPath();
  const store = createSqlitePersistence(temp.dbPath);
  try {
    store.receipts.issueReceipt({
      receipt_id: "gr_expired00001",
      plan_hash: "plan_expired000",
      nonce: "nonce_expired00",
      scope: "this_call_only",
      issued_at: "2026-03-16T10:00:00Z",
      expires_at: "2026-03-16T10:00:01Z",
    });

    const result = store.receipts.consumeReceipt({
      receipt_id: "gr_expired00001",
      plan_hash: "plan_expired000",
      nonce: "nonce_expired00",
      nowIso: "2026-03-16T10:01:00Z",
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "RECEIPT_EXPIRED");
  } finally {
    store.close();
    temp.cleanup();
  }
});

test("rejects plan_hash mismatch", () => {
  const temp = makeDbPath();
  const store = createSqlitePersistence(temp.dbPath);
  try {
    store.receipts.issueReceipt({
      receipt_id: "gr_planmismatch",
      plan_hash: "plan_expected01",
      nonce: "nonce_expected1",
      scope: "this_call_only",
      issued_at: "2026-03-16T10:00:00Z",
      expires_at: "2026-03-16T10:05:00Z",
    });

    const result = store.receipts.consumeReceipt({
      receipt_id: "gr_planmismatch",
      plan_hash: "plan_wrong00001",
      nonce: "nonce_expected1",
      nowIso: "2026-03-16T10:01:00Z",
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "PLAN_HASH_MISMATCH");
  } finally {
    store.close();
    temp.cleanup();
  }
});

test("rejects nonce mismatch", () => {
  const temp = makeDbPath();
  const store = createSqlitePersistence(temp.dbPath);
  try {
    store.receipts.issueReceipt({
      receipt_id: "gr_noncemismatch",
      plan_hash: "plan_noncecheck1",
      nonce: "nonce_expected2",
      scope: "this_call_only",
      issued_at: "2026-03-16T10:00:00Z",
      expires_at: "2026-03-16T10:05:00Z",
    });

    const result = store.receipts.consumeReceipt({
      receipt_id: "gr_noncemismatch",
      plan_hash: "plan_noncecheck1",
      nonce: "nonce_wrong0002",
      nowIso: "2026-03-16T10:01:00Z",
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "NONCE_MISMATCH");
  } finally {
    store.close();
    temp.cleanup();
  }
});

test("rejects double consume across store handles", () => {
  const temp = makeDbPath();
  const firstStore = createSqlitePersistence(temp.dbPath);
  const secondStore = createSqlitePersistence(temp.dbPath);
  try {
    firstStore.receipts.issueReceipt({
      receipt_id: "gr_doubleconsume",
      plan_hash: "plan_doublecons",
      nonce: "nonce_doublecons",
      scope: "this_call_only",
      issued_at: "2026-03-16T10:00:00Z",
      expires_at: "2026-03-16T10:05:00Z",
    });

    const first = firstStore.receipts.consumeReceipt({
      receipt_id: "gr_doubleconsume",
      plan_hash: "plan_doublecons",
      nonce: "nonce_doublecons",
      nowIso: "2026-03-16T10:01:00Z",
    });
    const replay = secondStore.receipts.consumeReceipt({
      receipt_id: "gr_doubleconsume",
      plan_hash: "plan_doublecons",
      nonce: "nonce_doublecons",
      nowIso: "2026-03-16T10:01:01Z",
    });
    const alternateNonce = secondStore.receipts.consumeReceipt({
      receipt_id: "gr_doubleconsume",
      plan_hash: "plan_doublecons",
      nonce: "nonce_another000",
      nowIso: "2026-03-16T10:01:02Z",
    });

    assert.equal(first.ok, true);
    assert.equal(replay.ok, false);
    assert.equal(replay.error, "REPLAY_DETECTED");
    assert.equal(alternateNonce.ok, false);
    assert.equal(alternateNonce.error, "RECEIPT_CONSUMED");
  } finally {
    firstStore.close();
    secondStore.close();
    temp.cleanup();
  }
});

test("preserves active receipts and decision logs across reopen", () => {
  const temp = makeDbPath();
  const firstStore = createSqlitePersistence(temp.dbPath);
  try {
    firstStore.receipts.issueReceipt({
      receipt_id: "gr_restartsafe1",
      plan_hash: "plan_restartsafe",
      nonce: "nonce_restartsafe",
      scope: "this_call_only",
      issued_at: "2026-03-16T10:00:00Z",
      expires_at: "2026-03-16T10:05:00Z",
    });
    firstStore.decisionLogs.append({
      schema_version: "decision-assistant/decision-log/v1",
      event_id: "evt_restartsafe1",
      decision_id: "dec_restartsafe1",
      ts: "2026-03-16T10:00:00Z",
      event_type: "receipt.issued",
      action: "ASSESS",
      verdict: "REQUIRE_CONFIRM",
      policy_version: "0.3.1",
      engine_version: "0.3.1",
      reason_codes: ["receipt_issued"],
      receipt_id: "gr_restartsafe1",
      plan_hash: "plan_restartsafe",
      nonce: "nonce_restartsafe",
      message: "receipt issued",
    });
  } finally {
    firstStore.close();
  }

  const reopened = createSqlitePersistence(temp.dbPath);
  try {
    const found = reopened.receipts.findActiveReceiptByPlanHash("plan_restartsafe", "2026-03-16T10:01:00Z");
    const consume = reopened.receipts.consumeReceipt({
      receipt_id: "gr_restartsafe1",
      plan_hash: "plan_restartsafe",
      nonce: "nonce_restartsafe",
      nowIso: "2026-03-16T10:02:00Z",
    });
    const logs = reopened.decisionLogs.listByDecisionId("dec_restartsafe1");

    assert.equal(found?.receipt_id, "gr_restartsafe1");
    assert.equal(consume.ok, true);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.event_type, "receipt.issued");
  } finally {
    reopened.close();
    temp.cleanup();
  }
});
