import type { TriggerSignals } from "../rules/refactor_time_black_hole.js";

/**
 * v0.1：Cursor 侧输入通常是自然语言 + 少量结构化上下文
 * 这里先用“轻量结构化输入”方式：允许用户直接给 signals JSON
 */
export type DetectTriggersInput = {
  signals?: TriggerSignals;
};

export type DetectTriggersOutput = {
  signals: TriggerSignals;
  notes: string[];
};

export function detectTriggers(input: DetectTriggersInput): DetectTriggersOutput {
  const notes: string[] = [];
  const signals = input.signals ?? {};

  if (!input.signals) notes.push("未提供 signals，使用空信号集（建议提供 signals 以提高准确性）");

  return { signals, notes };
}
