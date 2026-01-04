// src/utils/logger.ts
type LogArgs = unknown[];

function write(level: string, args: LogArgs) {
  const ts = new Date().toISOString();
  const msg = args
    .map((a) => (typeof a === "string" ? a : safeJson(a)))
    .join(" ");
  // 关键：全部写 stderr，避免污染 MCP stdout 协议
  process.stderr.write(`[${level}] ${ts} ${msg}\n`);
}

function safeJson(v: unknown) {
  try {
    return JSON.stringify(v);
  } catch {
    return "[unserializable]";
  }
}

export const logger = {
  info: (...args: LogArgs) => write("info", args),
  warn: (...args: LogArgs) => write("warn", args),
  error: (...args: LogArgs) => write("error", args),
  debug: (...args: LogArgs) => write("debug", args),
};
