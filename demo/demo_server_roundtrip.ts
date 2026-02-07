import { spawnSync } from "node:child_process";

function run(label: string, file: string) {
  // Avoid MSYS/Windows spawn issues with npx.cmd.
  // This assumes `tsx` is installed in devDependencies.
  const p = spawnSync("node", ["node_modules/tsx/dist/cli.mjs", file], { encoding: "utf8" });

  process.stdout.write(p.stdout || "");
  process.stderr.write(p.stderr || "");

  if (p.status !== 0) {
    console.error(`[roundtrip] ${label} failed: ${file} (exit=${p.status ?? "?"})`);
    process.exit(1);
  }
}

console.log("SERVER ROUNDTRIP EVIDENCE — v0.3d");
console.log("────────────────────────────────────────");

run("1/3 REQUIRE_CONFIRM", "demo/demo_require_confirm.ts");
run("2/3 EXECUTE (consume)", "demo/demo_execute.ts");
run("3/3 EXECUTE rejected (stale plan_hash)", "demo/demo_reject.ts");

console.log("");
console.log("PASS: server roundtrip evidence");
console.log(JSON.stringify({ ok: true, bundle: "server-roundtrip-evidence", version: "v0.3d" }, null, 2));
