import type { Signals, Answers } from "./types.js";

type ScoreResult = {
  score: number;              // 0..100
  reasons: string[];          // sorted desc by contribution
  breakdown: Record<string, number>;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function computeRiskScore(signals: Signals, answers?: Answers): ScoreResult {
  const evo = signals.evolution;
  const str = signals.structure;
  const cpx = signals.complexity;

  const contributions: { key: string; points: number; reason: string }[] = [];

  // A) Time Sink Risk (0..35)
  let timeSink = 0;

  if (evo.refactor_days >= 14) {
    timeSink += 25;
    contributions.push({ key: "timeSink", points: 25, reason: `Refactor streak is ${evo.refactor_days} days (>=14).` });
  } else if (evo.refactor_days >= 10) {
    timeSink += 18;
    contributions.push({ key: "timeSink", points: 18, reason: `Refactor streak is ${evo.refactor_days} days (>=10).` });
  } else if (evo.refactor_days >= 7) {
    timeSink += 10;
    contributions.push({ key: "timeSink", points: 10, reason: `Refactor streak is ${evo.refactor_days} days (>=7).` });
  }

  if (evo.no_user_feature_delivery_days >= 10) {
    timeSink += 10;
    contributions.push({ key: "noDelivery", points: 10, reason: `No user-facing delivery for ${evo.no_user_feature_delivery_days} days (>=10).` });
  } else if (evo.no_user_feature_delivery_days >= 7) {
    timeSink += 5;
    contributions.push({ key: "noDelivery", points: 5, reason: `No user-facing delivery for ${evo.no_user_feature_delivery_days} days (>=7).` });
  }

  let decisionDebt = 0;
  if (evo.decision_file_missing) {
    decisionDebt += 8;
    contributions.push({ key: "decisionDebt", points: 8, reason: "Decision/scope file is missing." });
  }
  if (evo.decision_file_invalid) {
    decisionDebt += 6;
    contributions.push({ key: "decisionDebt", points: 6, reason: "Decision/scope file exists but lacks timebox/acceptance criteria." });
  }
  decisionDebt = Math.min(14, decisionDebt);
  timeSink += decisionDebt;

  timeSink = Math.min(35, timeSink);

  // B) Change Amplification (0..25)
  let amplification = 0;

  const ft = evo.files_touched_per_change_median;
  if (ft >= 8) {
    amplification += 18;
    contributions.push({ key: "amplification", points: 18, reason: `Median files touched per change is ${ft} (>=8).` });
  } else if (ft >= 6) {
    amplification += 12;
    contributions.push({ key: "amplification", points: 12, reason: `Median files touched per change is ${ft} (>=6).` });
  } else if (ft >= 4) {
    amplification += 6;
    contributions.push({ key: "amplification", points: 6, reason: `Median files touched per change is ${ft} (>=4).` });
  }

  const ht = evo.same_module_touch_count_14d;
  if (ht >= 16) {
    amplification += 10;
    contributions.push({ key: "hotTouch", points: 10, reason: `Hot module touches in 14d is ${ht} (>=16).` });
  } else if (ht >= 12) {
    amplification += 7;
    contributions.push({ key: "hotTouch", points: 7, reason: `Hot module touches in 14d is ${ht} (>=12).` });
  } else if (ht >= 8) {
    amplification += 4;
    contributions.push({ key: "hotTouch", points: 4, reason: `Hot module touches in 14d is ${ht} (>=8).` });
  }

  amplification = Math.min(25, amplification);

  // C) Rework Risk (0..15)
  let rework = 0;
  const rr = evo.rollback_or_rework_events_14d;
  if (rr >= 3) {
    rework += 15;
    contributions.push({ key: "rework", points: 15, reason: `Rollback/rework events in 14d is ${rr} (>=3).` });
  } else if (rr === 2) {
    rework += 10;
    contributions.push({ key: "rework", points: 10, reason: `Rollback/rework events in 14d is 2.` });
  } else if (rr === 1) {
    rework += 5;
    contributions.push({ key: "rework", points: 5, reason: `Rollback/rework events in 14d is 1.` });
  }

  // D) Smell Hints (0..10)
  let smells = 0;
  if (str.duplicated_logic_hint) smells += 3;
  if (str.module_boundary_smell) smells += 3;
  if (cpx.branching_growth_hint) smells += 2;
  if (cpx.parameter_bloat_hint) smells += 1;
  if (cpx.workaround_comment_hint) smells += 1;
  smells = Math.min(10, smells);
  if (smells > 0) contributions.push({ key: "smells", points: smells, reason: "Structural/complexity smell hints are present." });

  // E) Answers adjustment (-10..+15)
  let adjust = 0;
  if (answers) {
    if (answers.feature_lead_time_trend === "UP") adjust += 8;
    else if (answers.feature_lead_time_trend === "FLAT") adjust += 3;
    else if (answers.feature_lead_time_trend === "DOWN") adjust -= 5;

    if (answers.fear_of_touching_hotspot) adjust += 7;

    if (answers.expected_next_feature_similarity === "HIGH") adjust += 5;
    else if (answers.expected_next_feature_similarity === "MEDIUM") adjust += 2;
  }
  adjust = clamp(adjust, -10, 15);
  if (adjust !== 0) contributions.push({ key: "answers", points: adjust, reason: "User answers adjust the risk estimate." });

  const scoreRaw = timeSink + amplification + rework + smells + adjust;
  const score = clamp(scoreRaw, 0, 100);

  // Sort reasons by absolute contribution desc
  const reasons = contributions
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 5)
    .map(c => `${c.reason} (${c.points >= 0 ? "+" : ""}${c.points})`);

  const breakdown: Record<string, number> = {
    timeSink,
    amplification,
    rework,
    smells,
    adjust
  };

  return { score, reasons, breakdown };
}
