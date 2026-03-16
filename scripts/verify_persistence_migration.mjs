import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

import {
  createSqlitePersistence,
  inspectSqliteRuntime,
  SQLITE_APPLICATION_ID,
  SQLITE_SCHEMA_USER_VERSION,
} from "../dist/persistence/sqlite_store.js";

function makeTempDb() {
  const dir = mkdtempSync(join(tmpdir(), "decision-assistant-migration-"));
  return { dir, dbPath: join(dir, "runtime.sqlite") };
}

function createLegacyDecisionLogDb(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE receipts (
      receipt_id TEXT PRIMARY KEY,
      plan_hash TEXT NOT NULL,
      nonce TEXT NOT NULL,
      scope TEXT NOT NULL,
      status TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    );

    CREATE TABLE replay_index (
      execution_key TEXT PRIMARY KEY,
      receipt_id TEXT NOT NULL,
      plan_hash TEXT NOT NULL,
      nonce TEXT NOT NULL,
      consumed_at TEXT NOT NULL
    );

    CREATE TABLE decision_logs (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      decision_id TEXT NOT NULL,
      ts TEXT NOT NULL,
      event_type TEXT NOT NULL,
      action TEXT NOT NULL,
      verdict TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      engine_version TEXT NOT NULL,
      reason_codes TEXT NOT NULL,
      receipt_id TEXT,
      plan_hash TEXT,
      nonce TEXT,
      message TEXT,
      payload_json TEXT
    );
  `);
  db.close();
}

function main() {
  const temp = makeTempDb();

  try {
    createLegacyDecisionLogDb(temp.dbPath);

    const store = createSqlitePersistence(temp.dbPath);
    store.close();

    const reopened = createSqlitePersistence(temp.dbPath);
    reopened.close();

    const db = new DatabaseSync(temp.dbPath);
    try {
      const columns = db.prepare(`PRAGMA table_info(decision_logs)`).all();
      assert.equal(
        columns.some((column) => column.name === "schema_version"),
        true,
        "migration must add schema_version to legacy decision_logs tables"
      );
    } finally {
      db.close();
    }

    const runtime = inspectSqliteRuntime(temp.dbPath);
    assert.equal(runtime.user_version, SQLITE_SCHEMA_USER_VERSION);
    assert.equal(runtime.application_id, SQLITE_APPLICATION_ID);
    assert.equal(runtime.triggers.includes("trg_decision_logs_no_update"), true);
    assert.equal(runtime.triggers.includes("trg_decision_logs_no_delete"), true);

    console.log("[verify:persistence-migration] OK");
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
}

main();
