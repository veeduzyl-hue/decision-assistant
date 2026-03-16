import { spawn } from "node:child_process";

function send(proc, msg) {
  proc.stdin.write(JSON.stringify(msg) + "\n");
}

async function main() {
  const proc = spawn("node", ["dist/server.js"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  });

  proc.stderr.on("data", (d) => {
    // 任何 stderr 都打印出来（不会污染协议，因为这是在 raw 脚本里）
    process.stderr.write("[server:stderr] " + d.toString());
  });

  let buffer = "";
  proc.stdout.on("data", (d) => {
    buffer += d.toString();
    // MCP stdio 通常是按行分隔的 JSON
    while (true) {
      const idx = buffer.indexOf("\n");
      if (idx === -1) break;
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;

      console.log("[server:stdout]", line);
      try {
        const obj = JSON.parse(line);
        // 收到 initialize 响应后，继续发 tools/call
        if (obj?.id === 1) {
          const call = {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
              name: "assess",
              arguments: {
                signals: {
                  refactor_days: 5,
                  ship_gap_days: 5,
                  refactor_commits_ratio: 0.72,
                  todo_growth_ratio: 0.35,
                  churn_ratio: 0.42,
                },
              },
            },
          };
          send(proc, call);
        }

        // 收到 tools/call 响应就退出
        if (obj?.id === 2) {
          console.log("DONE. Exiting.");
          proc.kill();
          process.exit(0);
        }
      } catch {
        // ignore non-json lines (if any)
      }
    }
  });

  proc.on("exit", (code, signal) => {
    console.error(`server exited. code=${code} signal=${signal}`);
  });

  // 发 initialize（这是 Client.connect 本来会做的握手）
  const init = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      clientInfo: { name: "handshake-raw", version: "0.1.0" },
      capabilities: {},
    },
  };

  send(proc, init);

  // 10 秒内不回任何 stdout，就判定 server 没响应 initialize
  setTimeout(() => {
    console.error("TIMEOUT: no initialize response from server within 10s.");
    proc.kill();
    process.exit(1);
  }, 10000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
