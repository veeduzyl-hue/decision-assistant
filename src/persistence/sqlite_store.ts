import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// application_id identifies Decision Assistant-owned SQLite files without
// affecting the public receipt or decision-log contracts.
const SQLITE_APPLICATION_ID = 0x44415354;
// user_version tracks persisted schema shape. Bump it only when on-disk table,
// index, or trigger layout changes in a way that requires migration logic.
const SQLITE_SCHEMA_USER_VERSION = 1;
const SQLITE_BUSY_TIMEOUT_MS = 5_000;

type SqliteStoreErrorCode =
  | "PERSISTENCE_OPEN_FAILED"
  | "PERSISTENCE_INVALID_STORE_IDENTITY"
  | "PERSISTENCE_UNSUPPORTED_SCHEMA_VERSION"
  | "PERSISTENCE_PARTIAL_SCHEMA"
  | "PERSISTENCE_WRITE_FAILED";

class SqliteStoreError extends Error {
  constructor(
    readonly code: SqliteStoreErrorCode,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "SqliteStoreError";
  }
}

export type ReceiptScope = "this_call_only";
export type ReceiptStatus = "active" | "consumed";

export type StoredReceipt = {
  receipt_id: string;
  plan_hash: string;
  nonce: string;
  scope: ReceiptScope;
  status: ReceiptStatus;
  issued_at: string;
  expires_at: string;
  consumed_at: string | null;
};

export type ReceiptState =
  | { status: "missing" }
  | {
      status: "active";
      plan_hash: string;
      nonce: string;
      scope: ReceiptScope;
      expires_at: string;
      expired: boolean;
    }
  | {
      status: "consumed";
      plan_hash: string;
      nonce: string;
      scope: ReceiptScope;
      consumed_at: string;
    };

export type DecisionLogEvent = {
  schema_version: "decision-assistant/decision-log/v1";
  event_id: string;
  decision_id: string;
  ts: string;
  event_type:
    | "decision.assessed"
    | "receipt.issued"
    | "receipt.reused"
    | "execute.accepted"
    | "execute.rejected"
    | "receipt.consumed";
  action: "ASSESS" | "EXECUTE";
  verdict: "WARN" | "REQUIRE_CONFIRM" | "BLOCK" | "EXECUTE_ACCEPTED" | "EXECUTE_REJECTED";
  policy_version: string;
  engine_version: string;
  reason_codes: string[];
  receipt_id?: string;
  plan_hash?: string;
  nonce?: string;
  message?: string;
  payload_json?: string;
};

export type ConsumeReceiptError =
  | "MISSING_RECEIPT"
  | "RECEIPT_EXPIRED"
  | "RECEIPT_CONSUMED"
  | "REPLAY_DETECTED"
  | "PLAN_HASH_MISMATCH"
  | "NONCE_MISMATCH";

export type ConsumeReceiptResult =
  | { ok: true; receipt: StoredReceipt; execution_key: string }
  | { ok: false; error: ConsumeReceiptError; receipt?: StoredReceipt };

export interface ReceiptRepository {
  issueReceipt(input: {
    receipt_id: string;
    plan_hash: string;
    nonce: string;
    scope: ReceiptScope;
    issued_at: string;
    expires_at: string;
  }): StoredReceipt;
  findActiveReceiptByPlanHash(plan_hash: string, nowIso: string): StoredReceipt | null;
  getReceiptState(receipt_id: string, nowIso: string): ReceiptState;
  consumeReceipt(input: {
    receipt_id: string;
    plan_hash: string;
    nonce: string;
    nowIso: string;
  }): ConsumeReceiptResult;
}

export interface ReplayIndexRepository {
  hasExecutionKey(execution_key: string): boolean;
}

export interface DecisionLogRepository {
  append(event: DecisionLogEvent): void;
  listAll(): DecisionLogEvent[];
  listByDecisionId(decision_id: string): DecisionLogEvent[];
  listByReceiptId(receipt_id: string): DecisionLogEvent[];
}

export interface PersistenceStore {
  receipts: ReceiptRepository;
  replayIndex: ReplayIndexRepository;
  decisionLogs: DecisionLogRepository;
  close(): void;
}

export type SqliteRuntimeMetadata = {
  journal_mode: string;
  synchronous: number;
  foreign_keys: number;
  busy_timeout: number;
  user_version: number;
  application_id: number;
  triggers: string[];
};

type ReceiptRow = {
  receipt_id: string;
  plan_hash: string;
  nonce: string;
  scope: ReceiptScope;
  status: ReceiptStatus;
  issued_at: string;
  expires_at: string;
  consumed_at: string | null;
};

type ExistingStoreState = {
  application_id: number;
  user_version: number;
  user_tables: string[];
};

const CRITICAL_TABLES = ["receipts", "replay_index", "decision_logs"] as const;
const CRITICAL_COLUMNS = {
  receipts: [
    "receipt_id",
    "plan_hash",
    "nonce",
    "scope",
    "status",
    "issued_at",
    "expires_at",
    "consumed_at",
  ],
  replay_index: ["execution_key", "receipt_id", "plan_hash", "nonce", "consumed_at"],
  decision_logs: [
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
} as const;

const LEGACY_ALLOWED_MISSING_COLUMNS = {
  decision_logs: new Set(["schema_version"]),
} as const;

const CRITICAL_TRIGGERS = ["trg_decision_logs_no_update", "trg_decision_logs_no_delete"] as const;

function ensureDirForFile(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function rowToReceipt(row: ReceiptRow): StoredReceipt {
  return {
    receipt_id: row.receipt_id,
    plan_hash: row.plan_hash,
    nonce: row.nonce,
    scope: row.scope,
    status: row.status,
    issued_at: row.issued_at,
    expires_at: row.expires_at,
    consumed_at: row.consumed_at,
  };
}

function buildExecutionKey(receipt_id: string, plan_hash: string, nonce: string): string {
  return `${receipt_id}:${plan_hash}:${nonce}`;
}

function isSqliteStoreError(error: unknown): error is SqliteStoreError {
  return error instanceof SqliteStoreError;
}

function listUserTables(db: DatabaseSync): string[] {
  return db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name ASC`
    )
    .all<{ name: string }>()
    .map((row) => row.name);
}

function listTableColumns(db: DatabaseSync, tableName: string): string[] {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all<{ name: string }>()
    .map((column) => column.name);
}

function listTriggers(db: DatabaseSync): string[] {
  return db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'trigger'
       ORDER BY name ASC`
    )
    .all<{ name: string }>()
    .map((row) => row.name);
}

function readExistingStoreState(db: DatabaseSync): ExistingStoreState {
  const applicationId = db.prepare(`PRAGMA application_id`).get<{ application_id: number }>();
  const userVersion = db.prepare(`PRAGMA user_version`).get<{ user_version: number }>();

  return {
    application_id: applicationId?.application_id ?? 0,
    user_version: userVersion?.user_version ?? 0,
    user_tables: listUserTables(db),
  };
}

function validateExistingStoreState(db: DatabaseSync, state: ExistingStoreState): void {
  if (state.application_id !== 0 && state.application_id !== SQLITE_APPLICATION_ID) {
    throw new SqliteStoreError(
      "PERSISTENCE_INVALID_STORE_IDENTITY",
      `Unexpected SQLite application_id=${state.application_id}`
    );
  }

  if (state.user_version > SQLITE_SCHEMA_USER_VERSION) {
    throw new SqliteStoreError(
      "PERSISTENCE_UNSUPPORTED_SCHEMA_VERSION",
      `Unsupported SQLite user_version=${state.user_version}`
    );
  }

  if (state.user_tables.length === 0) {
    return;
  }

  const presentCriticalTables = CRITICAL_TABLES.filter((table) => state.user_tables.includes(table));
  if (presentCriticalTables.length === 0) {
    throw new SqliteStoreError(
      "PERSISTENCE_INVALID_STORE_IDENTITY",
      "Existing SQLite file is not a Decision Assistant persistence store"
    );
  }

  if (presentCriticalTables.length !== CRITICAL_TABLES.length) {
    throw new SqliteStoreError(
      "PERSISTENCE_PARTIAL_SCHEMA",
      `Partial persistence schema detected: found tables=${presentCriticalTables.join(",")}`
    );
  }

  for (const table of CRITICAL_TABLES) {
    const columns = listTableColumns(db, table);
    const requiredColumns = CRITICAL_COLUMNS[table];
    const missingColumns = requiredColumns.filter((column) => !columns.includes(column));

    const allowedLegacyMissing = table in LEGACY_ALLOWED_MISSING_COLUMNS
      ? LEGACY_ALLOWED_MISSING_COLUMNS[table as keyof typeof LEGACY_ALLOWED_MISSING_COLUMNS]
      : undefined;

    const unsupportedMissing = missingColumns.filter(
      (column) => !(allowedLegacyMissing?.has(column as never) ?? false)
    );

    if (unsupportedMissing.length > 0) {
      throw new SqliteStoreError(
        "PERSISTENCE_PARTIAL_SCHEMA",
        `Critical persistence columns missing in ${table}: ${unsupportedMissing.join(",")}`
      );
    }
  }
}

function configureRuntimePragmas(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS};
  `);
}

function configureOpenPragmas(db: DatabaseSync): void {
  db.exec(`
    PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS};
  `);
}

function validateCriticalStructures(db: DatabaseSync): void {
  const userTables = listUserTables(db);
  for (const table of CRITICAL_TABLES) {
    if (!userTables.includes(table)) {
      throw new SqliteStoreError("PERSISTENCE_PARTIAL_SCHEMA", `Missing critical table ${table}`);
    }
  }

  for (const table of CRITICAL_TABLES) {
    const columns = listTableColumns(db, table);
    const missingColumns = CRITICAL_COLUMNS[table].filter((column) => !columns.includes(column));
    if (missingColumns.length > 0) {
      throw new SqliteStoreError(
        "PERSISTENCE_PARTIAL_SCHEMA",
        `Missing critical columns in ${table}: ${missingColumns.join(",")}`
      );
    }
  }

  const triggers = listTriggers(db);
  for (const trigger of CRITICAL_TRIGGERS) {
    if (!triggers.includes(trigger)) {
      throw new SqliteStoreError("PERSISTENCE_PARTIAL_SCHEMA", `Missing critical trigger ${trigger}`);
    }
  }
}

class SqliteReceiptRepository implements ReceiptRepository {
  constructor(private readonly db: DatabaseSync) {}

  issueReceipt(input: {
    receipt_id: string;
    plan_hash: string;
    nonce: string;
    scope: ReceiptScope;
    issued_at: string;
    expires_at: string;
  }): StoredReceipt {
    this.db.prepare(
      `INSERT INTO receipts (
        receipt_id, plan_hash, nonce, scope, status, issued_at, expires_at, consumed_at
      ) VALUES (?, ?, ?, ?, 'active', ?, ?, NULL)`
    ).run(
      input.receipt_id,
      input.plan_hash,
      input.nonce,
      input.scope,
      input.issued_at,
      input.expires_at
    );

    const row = this.db
      .prepare(
        `SELECT receipt_id, plan_hash, nonce, scope, status, issued_at, expires_at, consumed_at
         FROM receipts WHERE receipt_id = ?`
      )
      .get<ReceiptRow>(input.receipt_id);

    if (!row) throw new Error("Failed to load issued receipt");
    return rowToReceipt(row);
  }

  findActiveReceiptByPlanHash(plan_hash: string, nowIso: string): StoredReceipt | null {
    const row = this.db
      .prepare(
        `SELECT receipt_id, plan_hash, nonce, scope, status, issued_at, expires_at, consumed_at
         FROM receipts
         WHERE plan_hash = ? AND status = 'active' AND expires_at > ?
         ORDER BY issued_at DESC
         LIMIT 1`
      )
      .get<ReceiptRow>(plan_hash, nowIso);

    return row ? rowToReceipt(row) : null;
  }

  getReceiptState(receipt_id: string, nowIso: string): ReceiptState {
    const row = this.db
      .prepare(
        `SELECT receipt_id, plan_hash, nonce, scope, status, issued_at, expires_at, consumed_at
         FROM receipts WHERE receipt_id = ?`
      )
      .get<ReceiptRow>(receipt_id);

    if (!row) return { status: "missing" };

    if (row.status === "consumed") {
      return {
        status: "consumed",
        plan_hash: row.plan_hash,
        nonce: row.nonce,
        scope: row.scope,
        consumed_at: row.consumed_at ?? row.issued_at,
      };
    }

    return {
      status: "active",
      plan_hash: row.plan_hash,
      nonce: row.nonce,
      scope: row.scope,
      expires_at: row.expires_at,
      expired: row.expires_at <= nowIso,
    };
  }

  consumeReceipt(input: {
    receipt_id: string;
    plan_hash: string;
    nonce: string;
    nowIso: string;
  }): ConsumeReceiptResult {
    const execution_key = buildExecutionKey(input.receipt_id, input.plan_hash, input.nonce);

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db
        .prepare(
          `SELECT receipt_id, plan_hash, nonce, scope, status, issued_at, expires_at, consumed_at
           FROM receipts WHERE receipt_id = ?`
        )
        .get<ReceiptRow>(input.receipt_id);

      if (!row) {
        this.db.exec("ROLLBACK");
        return { ok: false, error: "MISSING_RECEIPT" };
      }

      const receipt = rowToReceipt(row);

      if (row.status !== "active") {
        const replayRow = this.db
          .prepare(`SELECT execution_key FROM replay_index WHERE execution_key = ?`)
          .get<{ execution_key: string }>(execution_key);
        this.db.exec("ROLLBACK");
        return { ok: false, error: replayRow ? "REPLAY_DETECTED" : "RECEIPT_CONSUMED", receipt };
      }

      if (row.expires_at <= input.nowIso) {
        this.db.exec("ROLLBACK");
        return { ok: false, error: "RECEIPT_EXPIRED", receipt };
      }

      if (row.plan_hash !== input.plan_hash) {
        this.db.exec("ROLLBACK");
        return { ok: false, error: "PLAN_HASH_MISMATCH", receipt };
      }

      if (row.nonce !== input.nonce) {
        this.db.exec("ROLLBACK");
        return { ok: false, error: "NONCE_MISMATCH", receipt };
      }

      const replayRow = this.db
        .prepare(`SELECT execution_key FROM replay_index WHERE execution_key = ?`)
        .get<{ execution_key: string }>(execution_key);
      if (replayRow) {
        this.db.exec("ROLLBACK");
        return { ok: false, error: "REPLAY_DETECTED", receipt };
      }

      this.db
        .prepare(
          `INSERT INTO replay_index (execution_key, receipt_id, plan_hash, nonce, consumed_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(execution_key, input.receipt_id, input.plan_hash, input.nonce, input.nowIso);

      const update = this.db
        .prepare(
          `UPDATE receipts
           SET status = 'consumed', consumed_at = ?
           WHERE receipt_id = ? AND status = 'active' AND expires_at > ?`
        )
        .run(input.nowIso, input.receipt_id, input.nowIso);

      if (update.changes !== 1) {
        this.db.exec("ROLLBACK");
        return { ok: false, error: "RECEIPT_CONSUMED", receipt };
      }

      this.db.exec("COMMIT");
      return {
        ok: true,
        execution_key,
        receipt: {
          ...receipt,
          status: "consumed",
          consumed_at: input.nowIso,
        },
      };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

class SqliteReplayIndexRepository implements ReplayIndexRepository {
  constructor(private readonly db: DatabaseSync) {}

  hasExecutionKey(execution_key: string): boolean {
    const row = this.db
      .prepare(`SELECT execution_key FROM replay_index WHERE execution_key = ?`)
      .get<{ execution_key: string }>(execution_key);
    return Boolean(row);
  }
}

class SqliteDecisionLogRepository implements DecisionLogRepository {
  constructor(private readonly db: DatabaseSync) {}

  private mapRows(
    rows: Array<{
      event_id: string;
      schema_version: "decision-assistant/decision-log/v1";
      decision_id: string;
      ts: string;
      event_type: DecisionLogEvent["event_type"];
      action: DecisionLogEvent["action"];
      verdict: DecisionLogEvent["verdict"];
      policy_version: string;
      engine_version: string;
      reason_codes: string;
      receipt_id: string | null;
      plan_hash: string | null;
      nonce: string | null;
      message: string | null;
      payload_json: string | null;
    }>
  ): DecisionLogEvent[] {
    return rows.map((row) => ({
      event_id: row.event_id,
      schema_version: row.schema_version,
      decision_id: row.decision_id,
      ts: row.ts,
      event_type: row.event_type,
      action: row.action,
      verdict: row.verdict,
      policy_version: row.policy_version,
      engine_version: row.engine_version,
      reason_codes: JSON.parse(row.reason_codes) as string[],
      ...(row.receipt_id ? { receipt_id: row.receipt_id } : {}),
      ...(row.plan_hash ? { plan_hash: row.plan_hash } : {}),
      ...(row.nonce ? { nonce: row.nonce } : {}),
      ...(row.message ? { message: row.message } : {}),
      ...(row.payload_json ? { payload_json: row.payload_json } : {}),
    }));
  }

  append(event: DecisionLogEvent): void {
    this.db
      .prepare(
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
          reason_codes,
          receipt_id,
          plan_hash,
          nonce,
          message,
          payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.event_id,
        event.schema_version,
        event.decision_id,
        event.ts,
        event.event_type,
        event.action,
        event.verdict,
        event.policy_version,
        event.engine_version,
        JSON.stringify(event.reason_codes),
        event.receipt_id ?? null,
        event.plan_hash ?? null,
        event.nonce ?? null,
        event.message ?? null,
        event.payload_json ?? null
      );
  }

  listAll(): DecisionLogEvent[] {
    return this.mapRows(
      this.db
        .prepare(
          `SELECT
            event_id,
            schema_version,
            decision_id,
            ts,
            event_type,
            action,
            verdict,
            policy_version,
            engine_version,
            reason_codes,
            receipt_id,
            plan_hash,
            nonce,
            message,
            payload_json
           FROM decision_logs
           ORDER BY seq ASC`
        )
        .all<{
          event_id: string;
          schema_version: "decision-assistant/decision-log/v1";
          decision_id: string;
          ts: string;
          event_type: DecisionLogEvent["event_type"];
          action: DecisionLogEvent["action"];
          verdict: DecisionLogEvent["verdict"];
          policy_version: string;
          engine_version: string;
          reason_codes: string;
          receipt_id: string | null;
          plan_hash: string | null;
          nonce: string | null;
          message: string | null;
          payload_json: string | null;
        }>()
    );
  }

  listByDecisionId(decision_id: string): DecisionLogEvent[] {
    return this.mapRows(
      this.db
        .prepare(
          `SELECT
            event_id,
            schema_version,
            decision_id,
            ts,
            event_type,
            action,
            verdict,
            policy_version,
            engine_version,
            reason_codes,
            receipt_id,
            plan_hash,
            nonce,
            message,
            payload_json
           FROM decision_logs
           WHERE decision_id = ?
           ORDER BY seq ASC`
        )
        .all<{
          event_id: string;
          schema_version: "decision-assistant/decision-log/v1";
          decision_id: string;
          ts: string;
          event_type: DecisionLogEvent["event_type"];
          action: DecisionLogEvent["action"];
          verdict: DecisionLogEvent["verdict"];
          policy_version: string;
          engine_version: string;
          reason_codes: string;
          receipt_id: string | null;
          plan_hash: string | null;
          nonce: string | null;
          message: string | null;
          payload_json: string | null;
        }>(decision_id)
    );
  }

  listByReceiptId(receipt_id: string): DecisionLogEvent[] {
    return this.mapRows(
      this.db
        .prepare(
          `SELECT
            event_id,
            schema_version,
            decision_id,
            ts,
            event_type,
            action,
            verdict,
            policy_version,
            engine_version,
            reason_codes,
            receipt_id,
            plan_hash,
            nonce,
            message,
            payload_json
           FROM decision_logs
           WHERE receipt_id = ?
           ORDER BY seq ASC`
        )
        .all<{
          event_id: string;
          schema_version: "decision-assistant/decision-log/v1";
          decision_id: string;
          ts: string;
          event_type: DecisionLogEvent["event_type"];
          action: DecisionLogEvent["action"];
          verdict: DecisionLogEvent["verdict"];
          policy_version: string;
          engine_version: string;
          reason_codes: string;
          receipt_id: string | null;
          plan_hash: string | null;
          nonce: string | null;
          message: string | null;
          payload_json: string | null;
        }>(receipt_id)
    );
  }
}

function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS receipts (
      receipt_id TEXT PRIMARY KEY,
      plan_hash TEXT NOT NULL,
      nonce TEXT NOT NULL,
      scope TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'consumed')),
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_receipts_plan_status
      ON receipts (plan_hash, status, expires_at);

    CREATE TABLE IF NOT EXISTS replay_index (
      execution_key TEXT PRIMARY KEY,
      receipt_id TEXT NOT NULL,
      plan_hash TEXT NOT NULL,
      nonce TEXT NOT NULL,
      consumed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS decision_logs (
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

    CREATE INDEX IF NOT EXISTS idx_decision_logs_decision
      ON decision_logs (decision_id, seq);

    CREATE TRIGGER IF NOT EXISTS trg_decision_logs_no_update
      BEFORE UPDATE ON decision_logs
      BEGIN
        SELECT RAISE(ABORT, 'decision_logs is append-only');
      END;

    CREATE TRIGGER IF NOT EXISTS trg_decision_logs_no_delete
      BEFORE DELETE ON decision_logs
      BEGIN
        SELECT RAISE(ABORT, 'decision_logs is append-only');
      END;
  `);

  const columns = db.prepare(`PRAGMA table_info(decision_logs)`).all<{ name: string }>();
  if (!columns.some((column) => column.name === "schema_version")) {
    // Legacy v0.5 databases may not have schema_version yet. The append-only
    // triggers do not block ALTER TABLE or future INSERT-only writes.
    db.exec(
      `ALTER TABLE decision_logs ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'decision-assistant/decision-log/v1'`
    );
  }

  db.exec(`
    PRAGMA application_id = ${SQLITE_APPLICATION_ID};
    PRAGMA user_version = ${SQLITE_SCHEMA_USER_VERSION};
  `);
}

function openValidatedSqliteDatabase(dbPath: string): DatabaseSync {
  let db: DatabaseSync;

  try {
    db = new DatabaseSync(dbPath);
  } catch (error) {
    throw new SqliteStoreError("PERSISTENCE_OPEN_FAILED", `Failed to open SQLite store at ${dbPath}`, error);
  }

  try {
    configureOpenPragmas(db);
    const existingState = readExistingStoreState(db);
    validateExistingStoreState(db, existingState);
    configureRuntimePragmas(db);
    initializeSchema(db);
    validateCriticalStructures(db);
    return db;
  } catch (error) {
    db.close();
    if (isSqliteStoreError(error)) {
      throw error;
    }
    throw new SqliteStoreError(
      "PERSISTENCE_WRITE_FAILED",
      `Failed to initialize or validate SQLite store at ${dbPath}`,
      error
    );
  }
}

export function defaultSqlitePath(): string {
  return process.env.DA_SQLITE_PATH ?? join(process.cwd(), ".decision_assistant", "runtime.sqlite");
}

export function createSqlitePersistence(dbPath: string = defaultSqlitePath()): PersistenceStore {
  ensureDirForFile(dbPath);
  const db = openValidatedSqliteDatabase(dbPath);

  return {
    receipts: new SqliteReceiptRepository(db),
    replayIndex: new SqliteReplayIndexRepository(db),
    decisionLogs: new SqliteDecisionLogRepository(db),
    close() {
      db.close();
    },
  };
}

export function inspectSqliteRuntime(dbPath: string = defaultSqlitePath()): SqliteRuntimeMetadata {
  ensureDirForFile(dbPath);
  const db = openValidatedSqliteDatabase(dbPath);

  try {
    const journalMode = db.prepare(`PRAGMA journal_mode`).get<{ journal_mode: string }>();
    const synchronous = db.prepare(`PRAGMA synchronous`).get<{ synchronous: number }>();
    const foreignKeys = db.prepare(`PRAGMA foreign_keys`).get<{ foreign_keys: number }>();
    const busyTimeout = db.prepare(`PRAGMA busy_timeout`).get<{ timeout: number } | { busy_timeout: number }>();
    const userVersion = db.prepare(`PRAGMA user_version`).get<{ user_version: number }>();
    const applicationId = db.prepare(`PRAGMA application_id`).get<{ application_id: number }>();
    const triggers = listTriggers(db);

    return {
      journal_mode: journalMode?.journal_mode ?? "",
      synchronous: synchronous?.synchronous ?? -1,
      foreign_keys: foreignKeys?.foreign_keys ?? 0,
      busy_timeout:
        "timeout" in (busyTimeout ?? {}) ? (busyTimeout as { timeout: number }).timeout : (busyTimeout as { busy_timeout: number } | undefined)?.busy_timeout ?? 0,
      user_version: userVersion?.user_version ?? 0,
      application_id: applicationId?.application_id ?? 0,
      triggers,
    };
  } finally {
    db.close();
  }
}

export { buildExecutionKey, SQLITE_APPLICATION_ID, SQLITE_BUSY_TIMEOUT_MS, SQLITE_SCHEMA_USER_VERSION };
