import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export type DecisionKind = "ALLOW" | "WARN" | "REQUIRE_CONFIRM" | "BLOCK";
export type UserAction = "pending" | "confirmed" | "aborted";

export interface TelemetryEvent {
  ts: string;                 // ISO timestamp
  session_id: string;         // ephemeral per process
  event: "decision_interruption";
  rule_id: string;
  decision: DecisionKind;
  signals?: Record<string, unknown>;
  user_action: UserAction;
  // Optional correlation id if you want to tie "pending" and "confirmed/aborted"
  // without any identity tracking.
  interruption_id?: string;
}

/**
 * Minimal local-only telemetry writer.
 * - JSONL append-only
 * - No external upload
 * - Opt-out via env var
 */
export class Telemetry {
  private readonly enabled: boolean;
  private readonly sessionId: string;
  private readonly filePath: string;

  constructor(opts?: { filePath?: string; enabled?: boolean; sessionId?: string }) {
    // Default enabled unless explicitly disabled
    const envEnabled = process.env.DA_TELEMETRY !== "0"; // set DA_TELEMETRY=0 to disable
    this.enabled = opts?.enabled ?? envEnabled;

    this.sessionId = opts?.sessionId ?? Telemetry.makeSessionId();
    this.filePath = opts?.filePath ?? Telemetry.defaultFilePath();

    if (this.enabled) {
      Telemetry.ensureDir(path.dirname(this.filePath));
    }
  }

  getSessionId() {
    return this.sessionId;
  }

  getFilePath() {
    return this.filePath;
  }

    /**
   * Record an interruption event (WARN/REQUIRE_CONFIRM/BLOCK).
   * Returns interruption_id you can use to correlate follow-up action events.
   */
    recordInterruption(params: {
        rule_id: string;
        decision: DecisionKind;
        signals?: Record<string, unknown>;
        user_action?: UserAction; // default "pending"
        interruption_id?: string; // ✅ allow caller to set correlation id (e.g., receipt_id)
      }): { interruption_id: string } {
        const interruption_id = params.interruption_id ?? Telemetry.makeInterruptionId();
    
        const evt: TelemetryEvent = {
          ts: new Date().toISOString(),
          session_id: this.sessionId,
          event: "decision_interruption",
          rule_id: params.rule_id,
          decision: params.decision,
          signals: params.signals ?? {},
          user_action: params.user_action ?? "pending",
          interruption_id,
        };
    
        this.append(evt);
        return { interruption_id };
      }
    
  /**
   * Record user action outcome as a follow-up append-only event.
   * Keep it as same event name for simpler aggregation.
   */
  recordAction(params: {
    rule_id: string;
    decision: DecisionKind;
    interruption_id: string;
    user_action: Exclude<UserAction, "pending">;
    signals?: Record<string, unknown>;
  }): void {
    const evt: TelemetryEvent = {
      ts: new Date().toISOString(),
      session_id: this.sessionId,
      event: "decision_interruption",
      rule_id: params.rule_id,
      decision: params.decision,
      signals: params.signals ?? {},
      user_action: params.user_action,
      interruption_id: params.interruption_id,
    };

    this.append(evt);
  }

  private append(evt: TelemetryEvent) {
    if (!this.enabled) return;

    try {
      fs.appendFileSync(this.filePath, JSON.stringify(evt) + "\n", { encoding: "utf8" });
    } catch {
      // Telemetry must NEVER break the tool. Swallow errors by design.
    }
  }

  static defaultFilePath() {
    // ~/.decision-assistant/telemetry.jsonl
    return path.join(os.homedir(), ".decision-assistant", "telemetry.jsonl");
  }

  static ensureDir(dir: string) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }

  static makeSessionId(): string {
    // ephemeral per process; do NOT persist
    // randomUUID is available in modern Node, fallback to randomBytes if needed
    const uuid = (crypto as any).randomUUID?.() ?? crypto.randomBytes(16).toString("hex");
    return uuid.replace(/-/g, "").slice(0, 8);
  }

  static makeInterruptionId(): string {
    return crypto.randomBytes(8).toString("hex"); // short correlation id
  }
}
