import fs from "fs";
import path from "path";
import type { AppState, ArtifactRecord, ArtifactType } from "./model";

const DEFAULT_STATE: AppState = {
  version: "0.1.0",
  artifacts: [],
  cooldown: {},
};

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function loadState(stateFilePath: string): AppState {
  try {
    if (!fs.existsSync(stateFilePath)) return { ...DEFAULT_STATE };
    const raw = fs.readFileSync(stateFilePath, "utf-8");
    const parsed = JSON.parse(raw) as AppState;
    // v0.1：轻量容错
    return {
      ...DEFAULT_STATE,
      ...parsed,
      artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
      cooldown: parsed.cooldown ?? {},
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveState(stateFilePath: string, state: AppState): void {
  ensureDir(path.dirname(stateFilePath));
  fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), "utf-8");
}

export function appendArtifact(
  stateFilePath: string,
  type: ArtifactType,
  payload: unknown
): ArtifactRecord {
  const state = loadState(stateFilePath);

  const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const rec: ArtifactRecord = {
    id,
    type,
    created_at: new Date().toISOString(),
    payload,
  };

  state.artifacts.unshift(rec); // 新的放前面，便于取最近
  // 控制体积：v0.1 先保留最近 200 条
  state.artifacts = state.artifacts.slice(0, 200);

  saveState(stateFilePath, state);
  return rec;
}

/**
 * v0.1 冷却期：同一 rule 在 cooldownSeconds 内不重复触发提示
 */
export function isInCooldown(
  stateFilePath: string,
  ruleId: string,
  now: Date = new Date()
): boolean {
  const state = loadState(stateFilePath);
  if (state.cooldown.last_rule_id !== ruleId) return false;
  if (!state.cooldown.until_iso) return false;
  return now.toISOString() < state.cooldown.until_iso;
}

export function setCooldown(
  stateFilePath: string,
  ruleId: string,
  cooldownSeconds: number,
  now: Date = new Date()
) {
  const state = loadState(stateFilePath);
  const until = new Date(now.getTime() + cooldownSeconds * 1000).toISOString();
  state.cooldown = { last_rule_id: ruleId, until_iso: until };
  saveState(stateFilePath, state);
}
