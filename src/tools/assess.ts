import type { AppConfig } from "../config/defaults.js";
import { evaluateRefactorTimeBlackhole } from "../rules/refactor_time_black_hole.js";
import type { TriggerSignals } from "../rules/refactor_time_black_hole.js";

import { computeRiskScore } from "../scoring/risk_score.js";
import { decide } from "../scoring/decision.js";
import type { Signals, Answers } from "../scoring/types.js";

// 关键：不用 node: 前缀，避免你环境里再次触发兼容性红线
import { existsSync } from "fs";
import { join } from "path";

export type AssessInput = {
  config: AppConfig;
  signals: TriggerSignals;
  answers?: Answers;
};

export type AssessOutput = {
  rule_hit: ReturnType<typeof evaluateRefactorTimeBlackhole>;
  risk: ReturnType<typeof computeRiskScore>;
  decision: ReturnType<typeof decide>;
};

/**
 * v0.1 映射：
 * TriggerSignals（扁平） → scoring 所需的 Signals（结构化）
 * 目标：单调一致、可解释、不制造反直觉风险
 */
function toSignalsV01(ts: TriggerSignals): Signals {
  const evo: any = {};
  const str: any = {};
  const cpx: any = {};

  // =====================================================
  // A) Time Sink Risk
  // =====================================================
  evo.refactor_days = Number((ts as any).refactor_days ?? 0);
  evo.no_user_feature_delivery_days = Number((ts as any).ship_gap_days ?? 0);

  // decision.md 位置：.decision_assistant/decision.md
  const decisionFilePath = join(
    process.cwd(),
    ".decision_assistant",
    "decision.md"
  );
  evo.decision_file_missing = !existsSync(decisionFilePath);
  evo.decision_file_invalid = false;

  // decide() 的硬条件之一（v0.1 暂保守）
  evo.refactor_scope_expanding = false;

  // =====================================================
  // B) Change Amplification Risk
  // 启发式映射：重构比例 & churn → 影响面
  // =====================================================
  evo.files_touched_per_change_median = Math.min(
    10,
    Math.round(((ts as any).refactor_commits_ratio ?? 0) * 10)
  );

  evo.same_module_touch_count_14d = Math.min(
    20,
    Math.round(((ts as any).churn_ratio ?? 0) * 20)
  );

  // =====================================================
  // C) Rework Risk
  // churn → 返工/回滚概率
  // =====================================================
  const churn = Number((ts as any).churn_ratio ?? 0);
  if (churn >= 0.5) evo.rollback_or_rework_events_14d = 3;
  else if (churn >= 0.35) evo.rollback_or_rework_events_14d = 2;
  else if (churn >= 0.2) evo.rollback_or_rework_events_14d = 1;
  else evo.rollback_or_rework_events_14d = 0;

  // =====================================================
  // D) Smell Hints
  // =====================================================
  str.duplicated_logic_hint = Number((ts as any).todo_growth_ratio ?? 0) >= 0.3;
  str.module_boundary_smell = Number((ts as any).refactor_commits_ratio ?? 0) >= 0.6;

  cpx.branching_growth_hint = Number((ts as any).churn_ratio ?? 0) >= 0.4;
  cpx.parameter_bloat_hint = false;
  cpx.workaround_comment_hint = false;

  // =====================================================
  // Defaults（v0.1 占位）
  // =====================================================
  str.dependency_cycles = 0;
  str.hotspot_files = 0;
  str.test_coverage_low = false;

  cpx.cognitive_complexity_high = false;
  cpx.large_diff_ratio = 0;

  return {
    evolution: evo,
    structure: str,
    complexity: cpx,
  } as Signals;
}

export function assess(input: AssessInput): AssessOutput {
  // 1) 业务规则：重构时间黑洞
  const rule_hit = evaluateRefactorTimeBlackhole(input.config, input.signals);

  // 2) scoring：结构化信号
  const signalsForScoring = toSignalsV01(input.signals);

  const risk = computeRiskScore(signalsForScoring, input.answers);
  const decisionRaw = decide(signalsForScoring, input.answers);

  // 3) v0.1 决策融合：规则兜底，避免“命中黑洞却 SHIP”
  const decision =
    rule_hit.hit && (decisionRaw as any).decision === "SHIP"
      ? {
          ...(decisionRaw as any),
          decision: "SCOPED_REFACTOR",
          reasons: [
            ...(((decisionRaw as any).reasons ?? []) as string[]),
            "[rule_override] Refactor Time Blackhole rule hit; override SHIP -> SCOPED_REFACTOR (v0.1).",
          ],
        }
      : decisionRaw;

  return { rule_hit, risk, decision } as AssessOutput;
}
