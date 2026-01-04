export type ArtifactType = "decision" | "signal" | "log";

export type ArtifactRecord = {
  id: string;
  type: ArtifactType;
  created_at: string; // ISO
  payload: unknown;
};

export type CooldownState = {
  // 同一规则在冷却期内不重复提醒（秒）
  until_iso?: string;
  last_rule_id?: string;
};

export type AppState = {
  version: "0.1.0";
  artifacts: ArtifactRecord[];
  cooldown: CooldownState;
};
