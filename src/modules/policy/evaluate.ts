import type { AppConfig } from "../../config/defaults.js";
import type { DecisionSignal } from "../assess/signal.js";
import { evaluateColdRules } from "../risk/cooldown.js";
import { evaluateAiMomentumOverride } from "../risk/r3_ai_momentum_override.js";
import { evaluateRefactorTimeBlackhole } from "../risk/refactor_time_black_hole.js";
import type { TriggerSignals } from "../risk/refactor_time_black_hole.js";
import type { PolicyDecision } from "./types.js";

function renderReasonText(reasons: any): string {
  if (!reasons) return "";

  // New structure: ReasonsMap
  if (typeof reasons === "object" && !Array.isArray(reasons)) {
    if (typeof reasons.default === "string") return reasons.default;
    return "";
  }

  // Old structure: string[]
  if (Array.isArray(reasons)) return reasons.join(" ");

  return String(reasons);
}

function toTriggerSignals(signals: DecisionSignal[]): TriggerSignals {
  // DecisionSignal[] → { [kind]: value }
  const m = new Map<string, unknown>();
  for (const s of signals ?? []) {
    const key = (s as any)?.key ?? (s as any)?.name ?? (s as any)?.kind;
    const value = (s as any)?.value;
    if (typeof key === "string") m.set(key, value);
  }

  const num = (k: string): number | undefined => {
    const v = m.get(k);
    return typeof v === "number" ? v : undefined;
  };
  const bool = (k: string): boolean | undefined => {
    const v = m.get(k);
    return typeof v === "boolean" ? v : undefined;
  };

  return {
    ship_gap_days: num("ship_gap_days"),
    refactor_commits_ratio: num("refactor_commits_ratio"),
    todo_growth_ratio: num("todo_growth_ratio"),
    churn_ratio: num("churn_ratio"),

    // optional extras some rules may use
    refactor_days: num("refactor_days"),
    files_touched: num("files_touched"),
    diff_lines_total: num("diff_lines_total"),
    touches_package_json: bool("touches_package_json"),
    touches_lockfile: bool("touches_lockfile"),
  } as TriggerSignals;
}

// Keep exits strongly-typed (avoid widening to string[])
const WARN_EXITS = ["TIMEBOX_10", "VALIDATE_FIRST"] as const;
const BLOCK_EXITS = ["STOP", "TIMEBOX_10", "VALIDATE_FIRST"] as const;

type SuggestedExits = PolicyDecision["suggestedExits"];

/**
 * Infra Policy Engine (v0.2)
 *
 * Product modes:
 * - cold (default): Phase 1 surface (cold-first, single-hit, low-noise)
 * - full: v0.2 engine mode (can include latent rules / richer logic)
 */
export function evaluate(signals: DecisionSignal[], config: AppConfig): PolicyDecision {
  const mode = config.mode ?? "cold";

  /**
   * Phase 1: Cold mode (default)
   * - return WARN => guardrail maps WARN -> REQUIRE_CONFIRM
   * - return BLOCK => guardrail outputs BLOCK
   */
  if (mode === "cold") {
    const cold = evaluateColdRules(signals, config);

    if (cold.hit) {
      const isHard = cold.rule_id.includes("hard") || cold.rule_id.includes("block");
      return {
        action: isHard ? "BLOCK" : "WARN",
        reason: renderReasonText(cold.reasons),
        suggestedExits: isHard ? [...BLOCK_EXITS] : [...WARN_EXITS],
      };
    }

    return { action: "ALLOW", reason: "No cold rules hit." };
  }

  /**
   * FULL mode:
   * - BLOCK can short-circuit (extreme safety valve only).
   * - WARN must NOT short-circuit (so latent rules can append evidence).
   *
   * IMPORTANT SEMANTICS:
   * - `config.guardrail.files_touched.block` is treated as a *confirmation threshold* (REQUIRE_CONFIRM window),
   *   NOT as a hard-stop. Hard-stop is reserved for extreme inputs only.
   * - This preserves a usable receipt window in demo + real use, while keeping an extreme safety valve.
   */
  let baseAction: PolicyDecision["action"] = "ALLOW";
  let baseReason = "";
  let suggestedExits: SuggestedExits = undefined;

  const filesTouched =
    (signals.find((s) => s.kind === "files_touched")?.value as number | undefined) ?? 0;

  const diffLines =
    (signals.find((s) => s.kind === "diff_lines_total")?.value as number | undefined) ?? 0;

  const { warn, block } = config.guardrail.files_touched;

  // Extreme safety valve (true hard stop). Keeps semantics: BLOCK => no receipt.
  // Chosen to be high enough that normal large refactors fall into REQUIRE_CONFIRM instead of BLOCK.
  const EXTREME_FILES_TOUCHED = Math.max(block * 2, 32);
  const EXTREME_DIFF_LINES = 5000;

  if (filesTouched >= EXTREME_FILES_TOUCHED || diffLines >= EXTREME_DIFF_LINES) {
    return {
      action: "BLOCK",
      reason: `Refactor risk exceeded extreme threshold (files_touched=${filesTouched}, diff_lines_total=${diffLines}).`,
      suggestedExits: [...BLOCK_EXITS],
    };
  }

  // WARN does not return; it sets base and continues (latent rules can append)
  if (filesTouched >= warn) {
    baseAction = "WARN";
    baseReason = `Warning threshold exceeded: this change touches ${filesTouched} files (>= ${warn}).`;
    suggestedExits = [...WARN_EXITS];
  }

  // Confirmation threshold window (still WARN; guardrail will map WARN -> REQUIRE_CONFIRM).
  if (filesTouched >= block) {
    baseAction = "WARN";
    baseReason = `Confirmation threshold exceeded: this change touches ${filesTouched} files (>= ${block}).`;
    suggestedExits = [...WARN_EXITS];
  }

  const triggerSignals = toTriggerSignals(signals);

  // Collect latent reasons; they can escalate ALLOW -> WARN
  const latentReasons: string[] = [];

  const r3 = evaluateAiMomentumOverride(config, triggerSignals);
  if (r3.hit) {
    latentReasons.push(`[latent:${r3.rule_id}] ${r3.reasons.join("；")}`);
    if (!suggestedExits) suggestedExits = [...WARN_EXITS];
    if (baseAction === "ALLOW") baseAction = "WARN";
  }

  const blackhole = evaluateRefactorTimeBlackhole(config, triggerSignals);
  if (blackhole.hit) {
    latentReasons.push(`[latent:${blackhole.rule_id}] ${blackhole.reasons.join("；")}`);
    if (!suggestedExits) suggestedExits = [...WARN_EXITS];
    if (baseAction === "ALLOW") baseAction = "WARN";
  }

  const reasonParts = [baseReason, ...latentReasons].filter(Boolean);
  const finalReason = reasonParts.length ? reasonParts.join(" | ") : "No high-cost signals detected.";

  return {
    action: baseAction,
    reason: finalReason,
    ...(suggestedExits ? { suggestedExits } : {}),
  };
}
