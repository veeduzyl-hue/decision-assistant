export type PolicyAction = "ALLOW" | "WARN" | "BLOCK";

export interface PolicyDecision {
  action: PolicyAction;
  reason: string;
  suggestedExits?: Array<"STOP" | "TIMEBOX_10" | "VALIDATE_FIRST">;
}
