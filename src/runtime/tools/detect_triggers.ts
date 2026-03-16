import { defaultConfig } from "../../config/defaults.js";
import type { DecisionSignal } from "../../modules/assess/signal.js";
import { evaluate } from "../../modules/policy/evaluate.js";
import type { PolicyDecision } from "../../modules/policy/types.js";
import type { TriggerSignals } from "../../modules/risk/refactor_time_black_hole.js";

export interface DetectTriggersInput {
  /** Cursor 侧输入通常是自然语言 + 少量结构化上下文 */
  text?: string;
  /** 结构化信号：如果不提供则使用空信号集 */
  signals?: TriggerSignals;
}

export interface DetectTriggersOutput {
  signals: TriggerSignals;
  notes: string[];

  /**
   * v0.2 (decision-infra): policy decision derived from normalized signals
   * Optional to keep v0.1 callers compatible.
   */
  policy?: PolicyDecision;

  /**
   * Expose normalized signals for debugging / future migration
   * Optional, safe to ignore.
   */
  infraSignals?: DecisionSignal[];
}

/**
 * v0.1：Cursor 侧输入通常是自然语言 + 少量结构化上下文
 * v0.2：把 signals 归一化为 DecisionSignal[]，交给 decision-infra 输出 policy（可选字段）
 */
export function detectTriggers(input: DetectTriggersInput): DetectTriggersOutput {
  const notes: string[] = [];
  const signals = input.signals ?? ({} as TriggerSignals);

  if (!input.signals) {
    notes.push("未提供 signals，使用空信号集（建议提供 signals 以提高准确性）");
  }

  // --- v0.2: normalize to infra signals (best-effort, tolerant mapping) ---
  const infraSignals = toInfraSignals(signals, notes);

  // evaluate policy (always safe; minimal kernel)
  const policy = evaluate(infraSignals, defaultConfig);

    return { signals, notes, policy, infraSignals };
}

/**
 * Best-effort normalization.
 * Adjust the field names below to match your TriggerSignals definition.
 */
function toInfraSignals(signals: TriggerSignals, notes: string[]): DecisionSignal[] {
  // Try common field names; fall back to 0.
  const filesTouched =
    numberOrZero((signals as any).filesTouchedMedian) ||
    numberOrZero((signals as any).files_touched_per_change_median) ||
    numberOrZero((signals as any).filesTouched) ||
    0;

  if (!filesTouched) {
    notes.push("infra: files_touched missing or 0; policy may be less sensitive.");
  }

  return [
    { kind: "files_touched", value: filesTouched, context: { source: "TriggerSignals" } },
  ];
}

function numberOrZero(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
