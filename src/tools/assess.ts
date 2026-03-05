import { defaultConfig } from "../config/defaults.js";
import type { AppConfig } from "../config/defaults.js";
import { evaluateRefactorTimeBlackhole } from "../rules/refactor_time_black_hole.js";
import type { TriggerSignals } from "../rules/refactor_time_black_hole.js";

import { computeRiskScore } from "../scoring/risk_score.js";
import { decide } from "../scoring/decision.js";
import type { Signals, Answers } from "../scoring/types.js";

// v0.2 infra + guardrail
import { evaluate } from "../infra/engine/evaluate.js";
import { evaluateGuardrail } from "../guardrail/evaluate_guardrail.js";
import type { DecisionSignal, PolicyDecision } from "../infra/types/index.js";
import type { GuardrailDecision, GuardrailReceipt } from "../guardrail/types.js";

// ✅ PURE ONLY: crypto is allowed (no I/O)
import { createHash, randomUUID } from "crypto";

function renderReasons(reasons: any): string[] {
  if (!reasons) return [];

  // New structure: { default, cold?, brutal? }
  if (typeof reasons === "object" && !Array.isArray(reasons)) {
    if (typeof reasons.default === "string") {
      return [reasons.default];
    }
    return [];
  }

  // Old structure: string[]
  if (Array.isArray(reasons)) {
    return reasons.filter((r) => typeof r === "string");
  }

  return [String(reasons)];
}

/**
 * confirm 语义收敛：
 * - ACK：仅确认收到 REQUIRE_CONFIRM（不放行）
 * - EXECUTE：带 receipt 签收并放行（需校验 plan_hash）
 */
export type ConfirmInput =
  | {
      mode: "ACK";
      receipt_id?: string;
      plan_hash?: string;
    }
  | {
      mode: "EXECUTE";
      receipt_id: string;
      plan_hash: string;
    };

/**
 * NOTE:
 * - signals 允许携带额外字段（TriggerSignals + extras）
 * - assess() MUST remain pure: NO I/O, NO state reads
 */
export type AssessInput = {
  config?: AppConfig;
  signals: TriggerSignals & Record<string, unknown>;
  answers?: Answers;
  confirm?: ConfirmInput;
};

export type AssessOutput = {
  rule_hit: ReturnType<typeof evaluateRefactorTimeBlackhole>;
  risk: ReturnType<typeof computeRiskScore>;
  decision: ReturnType<typeof decide>;
  infraSignals: DecisionSignal[];
  policy: PolicyDecision;
  guardrail: GuardrailDecision;
};

/* ------------------------------------------------------------------ */
/* Receipt helpers (PURE)                                              */
/* ------------------------------------------------------------------ */

function stableStringify(obj: unknown): string {
  const seen = new WeakSet<object>();
  const sorter = (value: any): any => {
    if (value === null || value === undefined) return value;
    if (typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(sorter);
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const keys = Object.keys(value).sort();
    const out: Record<string, any> = {};
    for (const k of keys) out[k] = sorter(value[k]);
    return out;
  };
  return JSON.stringify(sorter(obj));
}

function sha256Short(input: string, len = 12): string {
  return createHash("sha256").update(input).digest("hex").slice(0, len);
}

function makeReceiptId(): string {
  return `gr_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/**
 * 用“计划摘要”生成 plan_hash（PURE）
 */
function buildPlanHash(args: {
  infraSignals: DecisionSignal[];
  policy: PolicyDecision;
  guardrail: GuardrailDecision;
}): string {
  const planSummary = {
    infraSignals: args.infraSignals,
    policy: {
      action: args.policy.action,
      reason: args.policy.reason,
      suggestedExits: (args.policy as any)?.suggestedExits ?? [],
    },
    guardrail: {
      action: args.guardrail.action,
      reason: (args.guardrail as any)?.reason,
    },
  };
  return `plan_${sha256Short(stableStringify(planSummary))}`;
}

/* ------------------------------------------------------------------ */
/* Signal mappings (PURE)                                              */
/* ------------------------------------------------------------------ */

function toSignalsV01(ts: TriggerSignals & Record<string, unknown>): Signals {
  const evo: any = {};
  const str: any = {};
  const cpx: any = {};

  // A) Time Sink Risk
  evo.refactor_days = Number((ts as any).refactor_days ?? 0);
  evo.no_user_feature_delivery_days = Number((ts as any).ship_gap_days ?? 0);

  // NOTE: decision_file_missing MUST be injected by upstream (detect_triggers / server),
  // NOT computed here (no fs access in assess).
  evo.decision_file_missing = Boolean((ts as any).decision_file_missing ?? false);
  evo.decision_file_invalid = false;
  evo.refactor_scope_expanding = false;

  // B) Change Amplification Risk
  evo.files_touched_per_change_median = Math.min(
    10,
    Math.round(((ts as any).refactor_commits_ratio ?? 0) * 10)
  );
  evo.same_module_touch_count_14d = Math.min(
    20,
    Math.round(((ts as any).churn_ratio ?? 0) * 20)
  );

  // C) Rework Risk
  const churn = Number((ts as any).churn_ratio ?? 0);
  evo.rollback_or_rework_events_14d =
    churn >= 0.5 ? 3 : churn >= 0.35 ? 2 : churn >= 0.2 ? 1 : 0;

  // D) Smell Hints
  str.duplicated_logic_hint = Number((ts as any).todo_growth_ratio ?? 0) >= 0.3;
  str.module_boundary_smell = Number((ts as any).refactor_commits_ratio ?? 0) >= 0.6;

  cpx.branching_growth_hint = Number((ts as any).churn_ratio ?? 0) >= 0.4;
  cpx.parameter_bloat_hint = false;
  cpx.workaround_comment_hint = false;

  // Defaults
  str.dependency_cycles = 0;
  str.hotspot_files = 0;
  str.test_coverage_low = false;
  cpx.cognitive_complexity_high = false;
  cpx.large_diff_ratio = 0;

  return { evolution: evo, structure: str, complexity: cpx } as Signals;
}

/**
 * Phase 1+ infra signals (PURE):
 * Convert TriggerSignals(+extra) -> DecisionSignal[]
 *
 * IMPORTANT:
 * - No git/fs/process calls here.
 * - Derived git signals MUST be computed upstream and injected into `signals`.
 */
function toInfraSignals(ts: TriggerSignals & Record<string, unknown>): DecisionSignal[] {
  const infraSignals: DecisionSignal[] = [];

  const pushNumber = (kind: string, v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) {
      infraSignals.push({ kind: kind as any, value: v as any, context: { source: "TriggerSignals" } });
    }
  };
  const pushString = (kind: string, v: unknown) => {
    if (typeof v === "string") {
      infraSignals.push({ kind: kind as any, value: v as any, context: { source: "TriggerSignals" } });
    }
  };
  const pushStringArray = (kind: string, v: unknown) => {
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      infraSignals.push({ kind: kind as any, value: v as any, context: { source: "TriggerSignals" } });
    }
  };
  const pushBoolean = (kind: string, v: unknown) => {
    if (typeof v === "boolean") {
      infraSignals.push({ kind: kind as any, value: v as any, context: { source: "TriggerSignals" } });
    }
  };

  const numberOr = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const booleanOr = (v: unknown, fallback: boolean): boolean =>
    typeof v === "boolean" ? v : fallback;

  // Existing: files_touched
  pushNumber("files_touched", (ts as any).files_touched);

  // Phase 1 cold rules: R2/R3/R4 (expected to be present or omitted)
  pushNumber("files_touched_per_change_median", (ts as any).files_touched_per_change_median);
  pushNumber("lines_added", (ts as any).lines_added);
  pushNumber("active_duration_ms", (ts as any).active_duration_ms);

  pushString("input_source", (ts as any).input_source);
  pushString("active_goal", (ts as any).active_goal);
  pushStringArray("touched_paths", (ts as any).touched_paths);

  // Latent R3 (FULL): git diff derived signals (MUST be injected upstream)
  pushNumber("diff_lines_total", numberOr((ts as any).diff_lines_total, 0));
  pushBoolean("touches_package_json", booleanOr((ts as any).touches_package_json, false));
  pushBoolean("touches_lockfile", booleanOr((ts as any).touches_lockfile, false));

  return infraSignals;
}

/* ------------------------------------------------------------------ */
/* assess (PURE)                                                       */
/* ------------------------------------------------------------------ */

export function assess(input: AssessInput): AssessOutput {
  // Use provided config if present, otherwise default
  const cfg: AppConfig = input.config ?? defaultConfig;

  // 1) v0.1 rule (latent, Phase 2)
  const rule_hit = evaluateRefactorTimeBlackhole(cfg, input.signals);

  // 2) scoring (Phase 2 internal capability)
  const signalsForScoring = toSignalsV01(input.signals);
  const risk = computeRiskScore(signalsForScoring, input.answers);
  const decisionRaw = decide(signalsForScoring, input.answers);

  // 3) rule override (type-stable)
  const decision: ReturnType<typeof decide> =
    rule_hit.hit && decisionRaw.decision === "ALLOW"
      ? {
          ...decisionRaw,
          decision: ("SCOPED_REFACTOR" as (typeof decisionRaw)["decision"]),
          reasons: [
            ...renderReasons(decisionRaw.reasons),
            "[rule_override] Refactor Time Blackhole rule hit; override ALLOW -> SCOPED_REFACTOR.",
          ],
        }
      : decisionRaw;

  // 4) v0.2 infra + guardrail (Phase 1 surface)
  const infraSignals = toInfraSignals(input.signals);
  const policy = evaluate(infraSignals, cfg); // IMPORTANT: use cfg, not defaultConfig
  const guardrailBase = evaluateGuardrail({ infraSignals, policy });

  /**
   * REQUIRE_CONFIRM behavior:
   * - REQUIRE_CONFIRM returns receipt + executed:false + confirmation.required:true
   * - EXECUTE allow: receipt_id MUST reuse confirm.receipt_id (no new receipt_id)
   */
  if (guardrailBase.action === "REQUIRE_CONFIRM") {
    const plan_hash = buildPlanHash({ infraSignals, policy, guardrail: guardrailBase });

    const newReceipt = (): GuardrailReceipt => ({
      receipt_id: makeReceiptId(),
      plan_hash,
      scope: "this_call_only",
    });

    const confirm = input.confirm;

    // (A) first call: no confirm -> issue new receipt (pure value)
    if (!confirm) {
      const receipt = newReceipt();
      return {
        rule_hit,
        risk,
        decision,
        infraSignals,
        policy,
        guardrail: {
          action: "REQUIRE_CONFIRM",
          reason: guardrailBase.reason,
          receipt,
          executed: false,
          confirmation: { required: true },
        },
      };
    }

    // (B) ACK: still require confirm; issue a fresh receipt (pure value)
    if (confirm.mode === "ACK") {
      const receipt = newReceipt();
      return {
        rule_hit,
        risk,
        decision,
        infraSignals,
        policy,
        guardrail: {
          action: "REQUIRE_CONFIRM",
          reason: guardrailBase.reason,
          receipt,
          executed: false,
          confirmation: {
            required: true,
            acknowledged: true,
            ack_receipt_id: confirm.receipt_id,
          },
        },
      };
    }

    // (C) EXECUTE: validate plan_hash only (no store reads)
    if (confirm.mode === "EXECUTE") {
      if (confirm.plan_hash !== plan_hash) {
        const receipt = newReceipt();
        return {
          rule_hit,
          risk,
          decision,
          infraSignals,
          policy,
          guardrail: {
            action: "REQUIRE_CONFIRM",
            reason: guardrailBase.reason + " (confirmation rejected: receipt is stale or plan changed)",
            receipt,
            executed: false,
            confirmation: {
              required: true,
              rejected: true,
              error: "STALE_RECEIPT_OR_PLAN_CHANGED",
              provided: { receipt_id: confirm.receipt_id, plan_hash: confirm.plan_hash },
              expected: { plan_hash },
            },
          },
        };
      }

      // allow: reuse user-confirmed receipt_id
      return {
        rule_hit,
        risk,
        decision,
        infraSignals,
        policy,
        guardrail: {
          action: "ALLOW",
          reason: `User confirmed execution for plan_hash ${plan_hash}.`,
          receipt: {
            receipt_id: confirm.receipt_id,
            plan_hash,
            scope: "this_call_only",
          },
          executed: true,
          confirmation: {
            required: false,
            confirmed: true,
            confirmed_plan_hash: plan_hash,
            confirmed_receipt_id: confirm.receipt_id,
          },
        },
      };
    }
  }

  // default
  return {
    rule_hit,
    risk,
    decision,
    infraSignals,
    policy,
    guardrail: guardrailBase,
  };
}
