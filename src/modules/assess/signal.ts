// Decision signal types used by assess/policy/runtime boundaries.
/**
 * DecisionSignal (infra)
 * - Pure data, no behavior
 * - Kept intentionally small and explicit to preserve determinism
 *
 * NOTE:
 * `kind` is a closed union so TypeScript can catch typos.
 * If you add a new signal key in tools/assess.ts (toInfraSignals),
 * you MUST also add it here.
 */

export type SignalKind =
  | "files_touched"
  | "diff_lines_total"
  | "touches_package_json"
  | "touches_lockfile"
  | "touched_paths"
  | "lines_added"
  | "active_duration_ms"
  | "input_source"
  | "active_goal"
  | "files_touched_per_change_median";

/**
 * A single normalized decision signal.
 * `value` is intentionally unioned to keep JSON contract simple.
 */
export type DecisionSignal = {
  kind: SignalKind;
  value: number | boolean | string | string[];
  context?: Record<string, unknown>;
};
