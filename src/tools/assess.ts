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

// 关键：不用 node: 前缀，避免你环境里再次触发兼容性红线
import { existsSync } from "fs";
import { join } from "path";
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
 * - 你的脚本传入的 signals 已经包含 files_touched_per_change_median / lines_added / ...
 * - 为了兼容，我们允许 signals 在 TriggerSignals 基础上携带额外字段
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
/* Receipt helpers                                                     */
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
 * 用“计划摘要”生成 plan_hash：
 * 目标：用户签收的是“同一份计划”，不是一个布尔开关。
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
/* Signal mappings                                                     */
/* ------------------------------------------------------------------ */

function toSignalsV01(ts: TriggerSignals & Record<string, unknown>): Signals {
  const evo: any = {};
  const str: any = {};
  const cpx: any = {};

  // A) Time Sink Risk
  evo.refactor_days = Number((ts as any).refactor_days ?? 0);
  evo.no_user_feature_delivery_days = Number((ts as any).ship_gap_days ?? 0);

  const decisionFilePath = join(process.cwd(), ".decision_assistant", "decision.md");
  evo.decision_file_missing = !existsSync(decisionFilePath);
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
 * Phase 1+ infra signals:
 * Convert TriggerSignals(+extra) -> DecisionSignal[]
 *
 * Required for cold rules:
 * - files_touched_per_change_median (number)
 * - lines_added (number)
 * - active_duration_ms (number)
 * - diff_lines_total (number)
 * - new_files (number)
 * - touches_package_json (boolean)
 * - touches_lockfile (boolean)
 * - input_source (string)
 * - active_goal (string; intent alias accepted)
 * - touched_paths (string[])
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

  // Existing: files_touched
  pushNumber("files_touched", (ts as any).files_touched);

  // Phase 1 cold rules: R2/R3/R4
  pushNumber("files_touched_per_change_median", (ts as any).files_touched_per_change_median);
  pushNumber("lines_added", (ts as any).lines_added);
  pushNumber("active_duration_ms", (ts as any).active_duration_ms);

  pushNumber("diff_lines_total", (ts as any).diff_lines_total);
  pushNumber("new_files", (ts as any).new_files);

  pushBoolean("touches_package_json", (ts as any).touches_package_json);
  pushBoolean("touches_lockfile", (ts as any).touches_lockfile);

  pushString("input_source", (ts as any).input_source);
  pushString("active_goal", (ts as any).active_goal ?? (ts as any).intent);

  pushStringArray("touched_paths", (ts as any).touched_paths);

  return infraSignals;
}

/* ------------------------------------------------------------------ */
/* assess                                                              */
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
    rule_hit.hit && decisionRaw.decision === "SHIP"
    ? {
      ...decisionRaw,
      decision: ("SCOPED_REFACTOR" as (typeof decisionRaw)["decision"]),
      reasons: [
        ...renderReasons(decisionRaw.reasons),
        "[rule_override] Refactor Time Blackhole rule hit; override SHIP -> SCOPED_REFACTOR.",
      ],
    }
  
      : decisionRaw;

  // 4) v0.2 infra + guardrail (Phase 1 surface)
  const infraSignals = toInfraSignals(input.signals);
  const policy = evaluate(infraSignals, cfg); // IMPORTANT: use cfg, not defaultConfig
  const guardrailBase = evaluateGuardrail({ infraSignals, policy });

  /**
   * -------------------------
   * REQUIRE_CONFIRM behavior
   * -------------------------
   * 约定：
   * - REQUIRE_CONFIRM 必须返回 receipt + executed:false + confirmation.required:true
   * - EXECUTE 放行后，ALLOW 的 receipt_id 必须复用用户签收的 confirm.receipt_id（不得换单号）
   */
  if (guardrailBase.action === "REQUIRE_CONFIRM") {
    const plan_hash = buildPlanHash({ infraSignals, policy, guardrail: guardrailBase });

    // helper：仅在需要“发新回执”时生成
    const newReceipt = (): GuardrailReceipt => ({
      receipt_id: makeReceiptId(),
      plan_hash,
      scope: "this_call_only",
    });

    const confirm = input.confirm;

    // (A) 首次：无 confirm → 发新回执
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

    // (B) ACK：仅确认收到 → 仍发新回执（用户需对“最新回执”进行 EXECUTE）
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

    // (C) EXECUTE：校验 plan_hash
    if (confirm.mode === "EXECUTE") {
      // 校验失败：拒绝并发新回执
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
            reason:
              guardrailBase.reason + " (confirmation rejected: receipt is stale or plan changed)",
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

      // ✅ 放行：复用用户签收的 receipt_id（不得换单号）
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
