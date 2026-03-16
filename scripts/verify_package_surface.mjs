import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadJson(relPath) {
  return JSON.parse(readFileSync(resolve(process.cwd(), relPath), "utf8"));
}

function main() {
  const pkg = loadJson("package.json");

  assert.equal(pkg.name, "decision-assistant", "package name must remain decision-assistant");
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, "package version must be semver-shaped");
  assert.equal(pkg.type, "module", "package type must remain module");
  assert.equal(pkg.license, "MIT", "license must remain explicit");

  assert.deepEqual(
    pkg.bin,
    { "decision-assistant": "bin/decision-assistant.mjs" },
    "bin surface must remain stable"
  );
  assert.equal(existsSync(resolve(process.cwd(), pkg.bin["decision-assistant"])), true, "bin entrypoint must exist");

  assert.deepEqual(
    pkg.exports,
    { "./package.json": "./package.json" },
    "exports policy must stay explicit and must not expose a runtime import API"
  );

  assert.deepEqual(
    pkg.files,
    ["dist", "bin", "config"],
    "published file allowlist must remain stable"
  );

  assert.equal(typeof pkg.engines?.node, "string", "engines.node must be declared");
  assert.match(pkg.engines.node, /^>=\d+$/, "engines.node must use an explicit lower bound");

  assert.equal(typeof pkg.scripts?.build, "string", "build script must exist");
  assert.equal(
    pkg.scripts.build.includes("scripts/clean_dist.mjs"),
    true,
    "build must clean dist before compilation"
  );
  assert.equal(
    pkg.scripts["verify:package-surface"],
    "node scripts/verify_package_surface.mjs",
    "verify:package-surface script must remain stable"
  );
  assert.equal(
    pkg.scripts["verify:pack-contents"],
    "npm run build && node scripts/verify_npm_pack_contents.mjs",
    "verify:pack-contents script must remain stable"
  );

  const binText = readFileSync(resolve(process.cwd(), pkg.bin["decision-assistant"]), "utf8");
  assert.equal(
    binText.includes('../dist/server.js') || binText.includes("\"../dist/server.js\""),
    true,
    "bin entrypoint must resolve to dist/server.js"
  );

  assert.equal("main" in pkg, false, "package must not promise a root JS API through main");

  console.log("[verify:package-surface] OK");
}

main();
