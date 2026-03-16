import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

function runPackDryRun() {
  const cacheDir = resolve(process.cwd(), ".decision_assistant", "npm-cache");
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

  const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm.cmd pack --json --dry-run"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: cacheDir },
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "npm pack --dry-run failed");
  }

  const parsed = JSON.parse(result.stdout);
  assert.equal(Array.isArray(parsed), true, "npm pack --json must return an array");
  assert.equal(parsed.length > 0, true, "npm pack --json must return one artifact");
  return parsed[0];
}

function main() {
  const pack = runPackDryRun();
  const filePaths = new Set(pack.files.map((file) => file.path));

  const requiredPaths = [
    "LICENSE",
    "README.md",
    "package.json",
    "bin/decision-assistant.mjs",
    "dist/server.js",
    "config/schema/assess.request.schema.json",
    "config/schema/assess.response.schema.json",
    "config/schema/receipt.schema.json",
    "config/schema/decision-log-entry.schema.json",
    "config/schema/policy-config.schema.json",
  ];

  for (const path of requiredPaths) {
    assert.equal(filePaths.has(path), true, `packed artifact must include ${path}`);
  }

  const forbiddenPrefixes = [
    "src/",
    "tests/",
    "scripts/",
    "docs/",
    "archive/",
    ".github/",
    ".codex/",
    ".cursor/",
    ".vscode/",
    "schemas/",
    ".decision_assistant/",
    "node_modules/",
    "dist/guardrail/",
    "dist/infra/",
    "dist/rules/",
    "dist/storage/",
    "dist/scoring/",
    "dist/tools/",
  ];

  for (const path of filePaths) {
    for (const prefix of forbiddenPrefixes) {
      assert.equal(
        path.startsWith(prefix),
        false,
        `packed artifact must not include ${path}`
      );
    }
  }

  console.log("[verify:pack-contents] OK");
}

main();
