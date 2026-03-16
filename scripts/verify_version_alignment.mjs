import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readText(relPath) {
  return readFileSync(resolve(process.cwd(), relPath), "utf8");
}

function main() {
  const packageJson = JSON.parse(readText("package.json"));
  const defaultsText = readText("src/config/defaults.ts");
  const serverText = readText("src/server.ts");

  const defaultsVersionMatch = defaultsText.match(/app:\s*\{[\s\S]*?version:\s*"([^"]+)"/);
  assert.ok(defaultsVersionMatch, "defaultConfig.app.version must be present in src/config/defaults.ts");

  const defaultConfigVersion = defaultsVersionMatch[1];
  assert.equal(
    defaultConfigVersion,
    packageJson.version,
    "package.json version must match defaultConfig.app.version"
  );

  assert.match(
    serverText,
    /version:\s*config\.app\.version,/,
    "MCP server version must be sourced from config.app.version"
  );

  const policyVersionMatches = [...serverText.matchAll(/policy_version:\s*config\.app\.version,/g)];
  const engineVersionMatches = [...serverText.matchAll(/engine_version:\s*config\.app\.version,/g)];
  assert.ok(policyVersionMatches.length > 0, "server must emit policy_version from config.app.version");
  assert.ok(engineVersionMatches.length > 0, "server must emit engine_version from config.app.version");
  assert.doesNotMatch(
    serverText,
    /policy_version:\s*"[^"]+"/,
    "server must not hardcode literal policy_version values"
  );
  assert.doesNotMatch(
    serverText,
    /engine_version:\s*"[^"]+"/,
    "server must not hardcode literal engine_version values"
  );

  console.log(
    `[verify:version-alignment] OK package=${packageJson.version} runtime=${defaultConfigVersion} policy_refs=${policyVersionMatches.length} engine_refs=${engineVersionMatches.length}`
  );
}

main();
