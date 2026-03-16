import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

function runCommand(command, cwd, extraEnv = {}) {
  const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} failed`);
  }

  return result.stdout;
}

function createCacheDir() {
  const cacheDir = resolve(process.cwd(), ".decision_assistant", "npm-cache");
  return cacheDir;
}

function packArtifact() {
  const cacheDir = createCacheDir();
  const output = runCommand("npm.cmd pack --json", process.cwd(), { npm_config_cache: cacheDir });
  const parsed = JSON.parse(output);
  assert.equal(Array.isArray(parsed), true, "npm pack --json must return an array");
  return resolve(process.cwd(), parsed[0].filename);
}

function installTarball(tgzPath) {
  const tempDir = mkdtempSync(join(tmpdir(), "decision-assistant-install-smoke-"));
  const cacheDir = createCacheDir();
  const localTgz = join(tempDir, "decision-assistant.tgz");

  writeFileSync(
    join(tempDir, "package.json"),
    JSON.stringify({ name: "install-smoke", private: true, type: "module" }, null, 2)
  );
  copyFileSync(tgzPath, localTgz);

  runCommand(
    "npm.cmd install --no-package-lock --fund=false --audit=false .\\decision-assistant.tgz",
    tempDir,
    { npm_config_cache: cacheDir }
  );

  return tempDir;
}

function verifyExecutableStarts(tempDir) {
  const installedPkgJsonPath = join(tempDir, "node_modules", "decision-assistant", "package.json");
  const pkg = JSON.parse(readFileSync(installedPkgJsonPath, "utf8"));
  const binRel = pkg.bin["decision-assistant"];
  const binAbs = join(tempDir, "node_modules", "decision-assistant", ...binRel.split("/"));
  const result = spawnSync(process.execPath, [binAbs], {
    cwd: tempDir,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test" },
    timeout: 750,
  });

  if (result.error && result.error.code !== "ETIMEDOUT") {
    throw result.error;
  }

  if (result.status !== null && result.status !== 0) {
    throw new Error(`installed bin exited early with code=${result.status}\nstderr:\n${result.stderr}`);
  }
}

async function main() {
  let tgzPath;
  let tempDir;

  try {
    tgzPath = packArtifact();
    tempDir = installTarball(tgzPath);

    const pkgPath = join(tempDir, "node_modules", "decision-assistant", "package.json");
    assert.equal(existsSync(pkgPath), true, "installed package.json must exist");
    assert.equal(
      existsSync(join(tempDir, "node_modules", ".bin", "decision-assistant.cmd")) ||
        existsSync(join(tempDir, "node_modules", ".bin", "decision-assistant")),
      true,
      "installed executable entrypoint must exist"
    );

    verifyExecutableStarts(tempDir);

    console.log("[verify:install-smoke] OK");
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    if (tgzPath && existsSync(tgzPath)) unlinkSync(tgzPath);
  }
}

main().catch((error) => {
  console.error("[verify:install-smoke] FAIL");
  console.error(error);
  process.exit(1);
});
