import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createSqlitePersistence } from "../dist/persistence/sqlite_store.js";

function makeTempDb() {
  const dir = mkdtempSync(join(tmpdir(), "decision-assistant-recovery-"));
  return { dir, dbPath: join(dir, "runtime.sqlite") };
}

function main() {
  const temp = makeTempDb();

  try {
    const first = createSqlitePersistence(temp.dbPath);
    try {
      first.receipts.issueReceipt({
        receipt_id: "gr_recovery0001",
        plan_hash: "plan_recovery001",
        nonce: "nonce_recovery001",
        scope: "this_call_only",
        issued_at: "2026-03-17T10:00:00Z",
        expires_at: "2026-03-17T10:05:00Z",
      });

      const accepted = first.receipts.consumeReceipt({
        receipt_id: "gr_recovery0001",
        plan_hash: "plan_recovery001",
        nonce: "nonce_recovery001",
        nowIso: "2026-03-17T10:01:00Z",
      });
      assert.equal(accepted.ok, true);

      first.decisionLogs.append({
        schema_version: "decision-assistant/decision-log/v1",
        event_id: "evt_recovery0001",
        decision_id: "dec_recovery0001",
        ts: "2026-03-17T10:01:00Z",
        event_type: "receipt.consumed",
        action: "EXECUTE",
        verdict: "EXECUTE_ACCEPTED",
        policy_version: "0.5.0",
        engine_version: "0.5.0",
        reason_codes: ["REQUIRE_CONFIRM"],
        receipt_id: "gr_recovery0001",
        plan_hash: "plan_recovery001",
        nonce: "nonce_recovery001",
        message: "Receipt consumed successfully.",
      });

      first.receipts.issueReceipt({
        receipt_id: "gr_expired_recovery",
        plan_hash: "plan_expired_recovery",
        nonce: "nonce_expired_recovery",
        scope: "this_call_only",
        issued_at: "2026-03-17T10:00:00Z",
        expires_at: "2026-03-17T10:00:10Z",
      });

      const expired = first.receipts.consumeReceipt({
        receipt_id: "gr_expired_recovery",
        plan_hash: "plan_expired_recovery",
        nonce: "nonce_expired_recovery",
        nowIso: "2026-03-17T10:02:00Z",
      });
      assert.equal(expired.ok, false);
      assert.equal(expired.error, "RECEIPT_EXPIRED");
    } finally {
      first.close();
    }

    const reopened = createSqlitePersistence(temp.dbPath);
    try {
      assert.deepEqual(reopened.receipts.getReceiptState("gr_recovery0001", "2026-03-17T10:02:00Z"), {
        status: "consumed",
        plan_hash: "plan_recovery001",
        nonce: "nonce_recovery001",
        scope: "this_call_only",
        consumed_at: "2026-03-17T10:01:00Z",
      });

      assert.deepEqual(
        reopened.receipts.getReceiptState("gr_expired_recovery", "2026-03-17T10:02:00Z"),
        {
          status: "active",
          plan_hash: "plan_expired_recovery",
          nonce: "nonce_expired_recovery",
          scope: "this_call_only",
          expires_at: "2026-03-17T10:00:10Z",
          expired: true,
        }
      );

      const events = reopened.decisionLogs.listAll();
      assert.equal(events.length, 1);
      assert.equal(events[0]?.event_id, "evt_recovery0001");
    } finally {
      reopened.close();
    }

    console.log("[verify:persistence-recovery] OK");
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
}

main();
