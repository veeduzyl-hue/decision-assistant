import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

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
    PRAGMA journal_mode = WAL;
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
  `);

  const columns = db.prepare(`PRAGMA table_info(decision_logs)`).all<{ name: string }>();
  if (!columns.some((column) => column.name === "schema_version")) {
    db.exec(
      `ALTER TABLE decision_logs ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'decision-assistant/decision-log/v1'`
    );
  }
}

export function defaultSqlitePath(): string {
  return process.env.DA_SQLITE_PATH ?? join(process.cwd(), ".decision_assistant", "runtime.sqlite");
}

export function createSqlitePersistence(dbPath: string = defaultSqlitePath()): PersistenceStore {
  ensureDirForFile(dbPath);
  const db = new DatabaseSync(dbPath);
  initializeSchema(db);

  return {
    receipts: new SqliteReceiptRepository(db),
    replayIndex: new SqliteReplayIndexRepository(db),
    decisionLogs: new SqliteDecisionLogRepository(db),
    close() {
      db.close();
    },
  };
}

export { buildExecutionKey };
