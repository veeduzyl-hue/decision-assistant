import type { AppConfig } from "../../config/defaults.js";
import type { TriggerSignals } from "./refactor_time_black_hole.js";

export type RuleHit = {
  rule_id: "ai_momentum_override";
  hit: boolean;
  reasons: string[];
  signals: TriggerSignals;
};

export function evaluateAiMomentumOverride(
  cfg: AppConfig,
  signals: TriggerSignals
): RuleHit {
  const r = cfg.rules.ai_momentum_override;
  if (!r.enabled) {
    return { rule_id: "ai_momentum_override", hit: false, reasons: ["rule disabled"], signals };
  }

  const files = signals.files_touched ?? 0;
  const lines = signals.diff_lines_total ?? 0;
  const dep = !!signals.touches_package_json || !!signals.touches_lockfile;

  const filesWarn = r.thresholds?.files_touched_warn ?? 8;
  const diffWarn = r.thresholds?.diff_lines_warn ?? 400;

  const reasons: string[] = [];
  if (files >= filesWarn) reasons.push(`files_touched=${files} (>= ${filesWarn})`);
  if (lines >= diffWarn) reasons.push(`diff_lines_total=${lines} (>= ${diffWarn})`);
  if (dep) reasons.push("dependency file touched (package.json/lockfile)");

  const hit = files >= filesWarn && (lines >= diffWarn || dep);
  return { rule_id: "ai_momentum_override", hit, reasons, signals };
}
