import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

import {
  createSqlitePersistence,
  inspectSqliteRuntime,
  SQLITE_SCHEMA_USER_VERSION,
} from "../dist/persistence/sqlite_store.js";

function makeTempDb() {
  const dir = mkdtempSync(join(tmpdir(), "decision-assistant-version-discipline-"));
  return { dir, dbPath: join(dir, "runtime.sqlite") };
}

function tableColumns(db, tableName) {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map((row) => row.name);
}

function namedIndexes(db, tableName) {
  return db
    .prepare(`PRAGMA index_list(${tableName})`)
    .all()
    .map((row) => row.name)
    .filter((name) => !String(name).startsWith("sqlite_autoindex_"))
    .sort();
}

function main() {
  const temp = makeTempDb();

  try {
    const store = createSqlitePersistence(temp.dbPath);
    store.close();

    const runtime = inspectSqliteRuntime(temp.dbPath);
    assert.equal(
      runtime.user_version,
      SQLITE_SCHEMA_USER_VERSION,
      "persisted user_version must match the maintained SQLite schema baseline"
    );

    const db = new DatabaseSync(temp.dbPath);
    try {
      const layoutV1 = {
        receipts: {
          columns: [
            "receipt_id",
            "plan_hash",
            "nonce",
            "scope",
            "status",
            "issued_at",
            "expires_at",
            "consumed_at",
          ],
          indexes: ["idx_receipts_plan_status"],
        },
        replay_index: {
          columns: ["execution_key", "receipt_id", "plan_hash", "nonce", "consumed_at"],
          indexes: [],
        },
        decision_logs: {
          columns: [
            "seq",
            "event_id",
            "schema_version",
            "decision_id",
            "ts",
            "event_type",
            "action",
            "verdict",
            "policy_version",
            "engine_version",
            "reason_codes",
            "receipt_id",
            "plan_hash",
            "nonce",
            "message",
            "payload_json",
          ],
          indexes: ["idx_decision_logs_decision"],
        },
      };

      for (const [tableName, expected] of Object.entries(layoutV1)) {
        assert.deepEqual(
          tableColumns(db, tableName),
          expected.columns,
          `${tableName} columns must match the v${SQLITE_SCHEMA_USER_VERSION} persistence layout baseline`
        );
        assert.deepEqual(
          namedIndexes(db, tableName),
          expected.indexes,
          `${tableName} indexes must match the v${SQLITE_SCHEMA_USER_VERSION} persistence layout baseline`
        );
      }

      const triggers = db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name ASC`)
        .all()
        .map((row) => row.name);
      assert.deepEqual(
        triggers,
        ["trg_decision_logs_no_delete", "trg_decision_logs_no_update"],
        "trigger set must match the maintained persistence layout baseline"
      );
    } finally {
      db.close();
    }

    console.log(`[verify:persistence-version-discipline] OK user_version=${runtime.user_version}`);
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
}

main();
