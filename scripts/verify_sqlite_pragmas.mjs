import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  inspectSqliteRuntime,
  SQLITE_APPLICATION_ID,
  SQLITE_BUSY_TIMEOUT_MS,
  SQLITE_SCHEMA_USER_VERSION,
} from "../dist/persistence/sqlite_store.js";

const HARD_REQUIREMENTS = [
  "journal_mode=wal",
  "foreign_keys=1",
  `busy_timeout=${SQLITE_BUSY_TIMEOUT_MS}`,
  `user_version=${SQLITE_SCHEMA_USER_VERSION}`,
  `application_id=${SQLITE_APPLICATION_ID}`,
];

const EXPECTED_RUNTIME_SETTINGS = ["synchronous>=NORMAL"];

function makeTempDb() {
  const dir = mkdtempSync(join(tmpdir(), "decision-assistant-sqlite-pragmas-"));
  return { dir, dbPath: join(dir, "runtime.sqlite") };
}

function main() {
  const temp = makeTempDb();

  try {
    const runtime = inspectSqliteRuntime(temp.dbPath);
    assert.equal(runtime.journal_mode.toLowerCase(), "wal", "journal_mode must be WAL");
    assert.equal(runtime.foreign_keys, 1, "foreign_keys must be enabled");
    assert.equal(runtime.busy_timeout, SQLITE_BUSY_TIMEOUT_MS, "busy_timeout must match store baseline");
    assert.equal(runtime.user_version, SQLITE_SCHEMA_USER_VERSION, "user_version must match schema baseline");
    assert.equal(runtime.application_id, SQLITE_APPLICATION_ID, "application_id must identify Decision Assistant-owned databases");
    // SQLite may report NORMAL or stricter values depending on the engine, so
    // this verify only requires "enabled" rather than one exact machine-local integer.
    assert.equal(runtime.synchronous >= 1, true, "synchronous must be NORMAL or stricter");

    console.log(
      `[verify:sqlite-pragmas] OK hard=${HARD_REQUIREMENTS.join(",")} expected=${EXPECTED_RUNTIME_SETTINGS.join(",")}`
    );
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
}

main();
