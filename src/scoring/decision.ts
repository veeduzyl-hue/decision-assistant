import type { Signals, Answers, Decision } from "./types.js";
import { computeRiskScore } from "./risk_score.js";

export function decide(signals: Signals, answers?: Answers): { decision: Decision; risk_score: number; reasons: string[] } {
  const { score, reasons } = computeRiskScore(signals, answers);
  const evo = signals.evolution;

  // Hard condition: time black hole
  const hardTimeBlackHole =
    evo.refactor_days >= 10 &&
    evo.decision_file_missing === true &&
    evo.refactor_scope_expanding === true;

  let decision: Decision;

  if (hardTimeBlackHole || score >= 60) {
    decision = "HARD_REFACTOR";
  } else if (score >= 35) {
    decision = "SCOPED_REFACTOR";
  } else {
    // low score edge case: fear-of-touching overrides to scoped
    if (answers?.fear_of_touching_hotspot) decision = "SCOPED_REFACTOR";
    else decision = "SHIP";
  }

  return { decision, risk_score: score, reasons };
}
