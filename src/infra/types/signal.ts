export type SignalKind =
  | "time_on_scope"
  | "files_touched"
  | "change_frequency";

export interface DecisionSignal {
  kind: SignalKind;
  value: number;
  context?: Record<string, unknown>;
}
