import { assess } from "../src/tools/assess.js";
import { loadConfig } from "../src/config/loadConfig.js";

const config = loadConfig();

function run(files_touched: number) {
  const out = assess({
    config,
    signals: {
      files_touched,
      files_touched_per_change_median: 6,
      lines_added: 600,
      active_duration_ms: 3 * 60 * 60 * 1000,
      input_source: "demo",
      active_goal: "refactor / restructuring",
      touched_paths: ["src/", "docs/", "package.json"],
      diff_lines_total: 900,
      touches_package_json: true,
      touches_lockfile: true,
    } as any,
  });

  const g = (out as any).guardrail;
  return { files_touched, action: g?.action, reason: g?.reason };
}

for (const ft of [5, 6, 7, 8, 9, 10, 12, 15, 18, 20]) {
  const r = run(ft);
  console.log(`${String(r.files_touched).padStart(2)} -> ${r.action} | ${r.reason ?? ""}`);
}
