import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

import { createSqlitePersistence } from "../dist/persistence/sqlite_store.js";

function makeTempDb(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, dbPath: join(dir, "runtime.sqlite") };
}

function main() {
  const corrupt = makeTempDb("decision-assistant-corrupt-store-");
  const nonDa = makeTempDb("decision-assistant-non-da-store-");

  try {
    writeFileSync(corrupt.dbPath, "not a sqlite database", "utf8");

    assert.throws(
      () => createSqlitePersistence(corrupt.dbPath),
      (error) =>
        error &&
        typeof error === "object" &&
        (error.code === "PERSISTENCE_OPEN_FAILED" || error.code === "PERSISTENCE_WRITE_FAILED")
    );

    const db = new DatabaseSync(nonDa.dbPath);
    db.exec(`
      CREATE TABLE unrelated_data (
        id TEXT PRIMARY KEY,
        note TEXT NOT NULL
      );
    `);
    db.close();

    assert.throws(
      () => createSqlitePersistence(nonDa.dbPath),
      (error) =>
        error &&
        typeof error === "object" &&
        error.code === "PERSISTENCE_INVALID_STORE_IDENTITY" &&
        /not a Decision Assistant persistence store/i.test(String(error.message))
    );

    console.log("[verify:corrupt-store-reject] OK");
  } finally {
    rmSync(corrupt.dir, { recursive: true, force: true });
    rmSync(nonDa.dir, { recursive: true, force: true });
  }
}

main();
