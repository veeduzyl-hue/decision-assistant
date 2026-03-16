import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

import { createSqlitePersistence, inspectSqliteRuntime } from "../dist/persistence/sqlite_store.js";

function makeTempDb() {
  const dir = mkdtempSync(join(tmpdir(), "decision-assistant-log-integrity-"));
  return { dir, dbPath: join(dir, "runtime.sqlite") };
}

function main() {
  const temp = makeTempDb();
  const store = createSqlitePersistence(temp.dbPath);

  try {
    store.decisionLogs.append({
      schema_version: "decision-assistant/decision-log/v1",
      event_id: "evt_log_integrity_1",
      decision_id: "dec_log_integrity_1",
      ts: "2026-03-17T10:00:00Z",
      event_type: "decision.assessed",
      action: "ASSESS",
      verdict: "REQUIRE_CONFIRM",
      policy_version: "0.5.0",
      engine_version: "0.5.0",
      reason_codes: ["refactor_time_blackhole", "REQUIRE_CONFIRM"],
      message: "Decision assessed.",
    });
    store.close();

    const db = new DatabaseSync(temp.dbPath);
    try {
      const events = db
        .prepare(`SELECT seq, event_id FROM decision_logs ORDER BY seq ASC`)
        .all();
      assert.equal(events.length, 1);
      assert.equal(events[0]?.seq, 1);

      assert.throws(
        () =>
          db.prepare(`UPDATE decision_logs SET message = 'tampered' WHERE event_id = ?`).run(
            "evt_log_integrity_1"
          ),
        /append-only/
      );

      assert.throws(
        () => db.prepare(`DELETE FROM decision_logs WHERE event_id = ?`).run("evt_log_integrity_1"),
        /append-only/
      );

      db.prepare(
        `INSERT INTO decision_logs (
          event_id,
          schema_version,
          decision_id,
          ts,
          event_type,
          action,
          verdict,
          policy_version,
          engine_version,
          reason_codes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "evt_log_integrity_2",
        "decision-assistant/decision-log/v1",
        "dec_log_integrity_1",
        "2026-03-17T10:01:00Z",
        "receipt.issued",
        "ASSESS",
        "REQUIRE_CONFIRM",
        "0.5.0",
        "0.5.0",
        JSON.stringify(["REQUIRE_CONFIRM"])
      );

      const appended = db
        .prepare(`SELECT seq, event_id FROM decision_logs ORDER BY seq ASC`)
        .all();
      assert.equal(appended.length, 2);
      assert.equal(appended[1]?.seq, 2);
      assert.equal(appended[1]?.event_id, "evt_log_integrity_2");
    } finally {
      db.close();
    }

    const runtime = inspectSqliteRuntime(temp.dbPath);
    assert.equal(runtime.triggers.includes("trg_decision_logs_no_update"), true);
    assert.equal(runtime.triggers.includes("trg_decision_logs_no_delete"), true);

    console.log("[verify:decision-log-integrity] OK");
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
}

main();
