import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

import { createSqlitePersistence, SQLITE_APPLICATION_ID } from "../dist/persistence/sqlite_store.js";

function makeTempDb() {
  const dir = mkdtempSync(join(tmpdir(), "decision-assistant-store-identity-"));
  return { dir, dbPath: join(dir, "runtime.sqlite") };
}

function createWrongIdentityDb(dbPath) {
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
      schema_version TEXT NOT NULL DEFAULT 'decision-assistant/decision-log/v1',
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

    PRAGMA application_id = ${SQLITE_APPLICATION_ID + 1};
    PRAGMA user_version = 1;
  `);
  db.close();
}

function main() {
  const temp = makeTempDb();

  try {
    createWrongIdentityDb(temp.dbPath);

    assert.throws(
      () => createSqlitePersistence(temp.dbPath),
      (error) =>
        error &&
        typeof error === "object" &&
        error.code === "PERSISTENCE_INVALID_STORE_IDENTITY" &&
        /application_id/i.test(String(error.message))
    );

    console.log("[verify:store-identity] OK");
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
}

main();
