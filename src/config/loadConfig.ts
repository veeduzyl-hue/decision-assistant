import { defaultConfig, type AppConfig } from "./defaults.js";

export function loadConfig(): AppConfig {
  // v0.1：只用默认配置；v0.2：支持从 YAML/JSON 覆盖
  return defaultConfig;
}
