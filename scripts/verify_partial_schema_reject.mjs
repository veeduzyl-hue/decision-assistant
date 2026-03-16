import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

import { createSqlitePersistence, SQLITE_APPLICATION_ID } from "../dist/persistence/sqlite_store.js";

function makeTempDb() {
  const dir = mkdtempSync(join(tmpdir(), "decision-assistant-partial-schema-"));
  return { dir, dbPath: join(dir, "runtime.sqlite") };
}

function createPartialSchemaDb(dbPath) {
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

    PRAGMA application_id = ${SQLITE_APPLICATION_ID};
    PRAGMA user_version = 1;
  `);
  db.close();
}

function main() {
  const temp = makeTempDb();

  try {
    createPartialSchemaDb(temp.dbPath);

    assert.throws(
      () => createSqlitePersistence(temp.dbPath),
      (error) =>
        error &&
        typeof error === "object" &&
        error.code === "PERSISTENCE_PARTIAL_SCHEMA" &&
        /Partial persistence schema detected/i.test(String(error.message))
    );

    console.log("[verify:partial-schema-reject] OK");
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
}

main();
