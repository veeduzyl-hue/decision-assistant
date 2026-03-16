import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeTempDb() {
  const dir = mkdtempSync(join(tmpdir(), "decision-assistant-write-failure-"));
  return { dir, dbPath: join(dir, "runtime.sqlite") };
}

async function main() {
  const temp = makeTempDb();
  const sqliteModule = await import("node:sqlite");
  const { createSqlitePersistence } = await import("../dist/persistence/sqlite_store.js");
  const originalExec = sqliteModule.DatabaseSync.prototype.exec;
  let induced = false;

  try {
    sqliteModule.DatabaseSync.prototype.exec = function (sql) {
      if (!induced && String(sql).includes("CREATE TABLE IF NOT EXISTS receipts")) {
        induced = true;
        throw new Error("simulated write-path failure");
      }
      return originalExec.call(this, sql);
    };

    assert.throws(
      () => createSqlitePersistence(temp.dbPath),
      (error) =>
        error &&
        typeof error === "object" &&
        error.code === "PERSISTENCE_WRITE_FAILED" &&
        /initialize or validate SQLite store/i.test(String(error.message))
    );
  } finally {
    sqliteModule.DatabaseSync.prototype.exec = originalExec;
    rmSync(temp.dir, { recursive: true, force: true });
  }

  console.log("[verify:write-path-failure] OK");
}

main();
