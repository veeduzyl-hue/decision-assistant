import { spawnSync } from "node:child_process";

const p = spawnSync("node", ["node_modules/tsx/dist/cli.mjs", "demo/demo_server_roundtrip.ts"], { encoding: "utf8" });
process.stdout.write(p.stdout || "");
process.stderr.write(p.stderr || "");

if (p.status !== 0) {
  console.error("[CI] server roundtrip demo failed");
  process.exit(1);
}

if (!String(p.stdout || "").includes("PASS: server roundtrip evidence")) {
  console.error("[CI] evidence marker not found");
  process.exit(1);
}

console.log("[CI] OK: server roundtrip evidence");
