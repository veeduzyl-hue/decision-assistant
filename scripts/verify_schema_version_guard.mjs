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

function makeTempDb(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, dbPath: join(dir, "runtime.sqlite") };
}

function createStoreShape(dbPath, userVersion, includeSchemaVersion) {
  const schemaVersionColumn = includeSchemaVersion
    ? `schema_version TEXT NOT NULL DEFAULT 'decision-assistant/decision-log/v1',`
    : "";

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
      ${schemaVersionColumn}
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

    PRAGMA application_id = ${SQLITE_APPLICATION_ID};
    PRAGMA user_version = ${userVersion};
  `);
  db.close();
}

function main() {
  const future = makeTempDb("decision-assistant-schema-guard-future-");
  const legacy = makeTempDb("decision-assistant-schema-guard-legacy-");

  try {
    createStoreShape(future.dbPath, SQLITE_SCHEMA_USER_VERSION + 1, true);

    assert.throws(
      () => createSqlitePersistence(future.dbPath),
      (error) =>
        error &&
        typeof error === "object" &&
        error.code === "PERSISTENCE_UNSUPPORTED_SCHEMA_VERSION" &&
        /user_version/i.test(String(error.message))
    );

    createStoreShape(legacy.dbPath, 0, false);

    const store = createSqlitePersistence(legacy.dbPath);
    store.close();

    const runtime = inspectSqliteRuntime(legacy.dbPath);
    assert.equal(runtime.user_version, SQLITE_SCHEMA_USER_VERSION);

    console.log("[verify:schema-version-guard] OK");
  } finally {
    rmSync(future.dir, { recursive: true, force: true });
    rmSync(legacy.dir, { recursive: true, force: true });
  }
}

main();
