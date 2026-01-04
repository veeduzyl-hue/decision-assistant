import type { AppConfig } from "../config/defaults.js";

export type TriggerSignals = {
  // v0.1：这些字段对应你 schemas 里“signals/trigger”那套（若名字不同，你只需改这里的字段读取）
  ship_gap_days?: number;              // 最近一次交付间隔天数
  refactor_commits_ratio?: number;     // refactor 提交占比
  todo_growth_ratio?: number;          // TODO/FIXME 增长比
  churn_ratio?: number;                // 代码变更抖动占比
};

export type RuleHit = {
  rule_id: "refactor_time_blackhole";
  hit: boolean;
  reasons: string[];
  signals: TriggerSignals;
};

export function evaluateRefactorTimeBlackhole(cfg: AppConfig, signals: TriggerSignals): RuleHit {
  const r = cfg.rules.refactor_time_blackhole;
  if (!r.enabled) {
    return { rule_id: "refactor_time_blackhole", hit: false, reasons: ["rule disabled"], signals };
  }

  const reasons: string[] = [];
  const t = r.thresholds;

  const shipGap = signals.ship_gap_days ?? 0;
  const refactorRatio = signals.refactor_commits_ratio ?? 0;
  const todoGrowth = signals.todo_growth_ratio ?? 0;
  const churn = signals.churn_ratio ?? 0;

  if (shipGap >= t.refactor_days_without_ship) reasons.push(`连续 ${shipGap} 天无交付`);
  if (refactorRatio >= t.refactor_commits_ratio) reasons.push(`refactor 提交占比偏高 (${refactorRatio})`);
  if (todoGrowth >= t.todo_growth_ratio) reasons.push(`TODO/FIXME 增长偏快 (${todoGrowth})`);
  if (churn >= t.churn_ratio) reasons.push(`代码变更抖动偏高 (${churn})`);

  const hit = reasons.length >= 2; // v0.1：至少满足 2 条信号认为命中
  return { rule_id: "refactor_time_blackhole", hit, reasons, signals };
}
