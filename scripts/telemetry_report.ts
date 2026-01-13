import fs from "node:fs";
import path from "node:path";
import os from "node:os";

type DecisionKind = "ALLOW" | "WARN" | "REQUIRE_CONFIRM" | "BLOCK";
type UserAction = "pending" | "confirmed" | "aborted";

interface TelemetryEvent {
  ts: string;
  session_id: string;
  event: "decision_interruption";
  rule_id: string;
  decision: DecisionKind;
  signals?: Record<string, unknown>;
  user_action: UserAction;
  interruption_id?: string;
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      args.set(key, val);
    }
  }
  return args;
}

function defaultTelemetryPath() {
  // Must match src/telemetry.ts
  return path.join(os.homedir(), ".decision-assistant", "telemetry.jsonl");
}

function safeReadLines(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  return raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
}

function tryParseEvent(line: string): TelemetryEvent | null {
  try {
    const obj = JSON.parse(line);
    if (!obj || obj.event !== "decision_interruption") return null;
    if (typeof obj.ts !== "string") return null;
    return obj as TelemetryEvent;
  } catch {
    return null;
  }
}

function toDate(ts: string): Date | null {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysAgoDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function pct(n: number, d: number): string {
  if (d <= 0) return "0%";
  const p = (n / d) * 100;
  return `${p.toFixed(1)}%`;
}

function topN(map: Map<string, number>, n = 5) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const days = Number(args.get("days") ?? "7");
  const file = args.get("file") ?? defaultTelemetryPath();
  const since = daysAgoDate(Number.isFinite(days) ? days : 7);

  const lines = safeReadLines(file);
  const events: TelemetryEvent[] = lines
    .map(tryParseEvent)
    .filter(Boolean)
    .map((e) => e as TelemetryEvent)
    .filter((e) => {
      const d = toDate(e.ts);
      return d ? d >= since : false;
    });

  console.log("");
  console.log("Decision Assistant — Telemetry Report");
  console.log(`Window: last ${days} day(s) (since ${since.toISOString()})`);
  console.log(`File: ${file}`);
  console.log("");

  if (events.length === 0) {
    console.log("No events found in this window.");
    console.log("Tip: run your MCP tool once to generate telemetry, or check DA_TELEMETRY=0.");
    console.log("");
    return;
  }

  // Aggregate by interruption_id
  const byId = new Map<string, TelemetryEvent[]>();
  for (const e of events) {
    const id = e.interruption_id ?? "(no_id)";
    const arr = byId.get(id) ?? [];
    arr.push(e);
    byId.set(id, arr);
  }

  let interruptions = 0; // count of unique ids (excluding no_id)
  let pending = 0;
  let confirmed = 0;
  let aborted = 0;

  const decisionCounts = new Map<string, number>();
  const ruleCounts = new Map<string, number>();

  // For decision/rule we count "pending" as an interruption occurrence (most meaningful baseline)
  for (const [id, arr] of byId.entries()) {
    // sort by time
    arr.sort((a, b) => (a.ts < b.ts ? -1 : 1));

    const hasPending = arr.some((x) => x.user_action === "pending");
    const hasConfirmed = arr.some((x) => x.user_action === "confirmed");
    const hasAborted = arr.some((x) => x.user_action === "aborted");

    if (id !== "(no_id)") interruptions++;

    if (hasPending) pending++;
    if (hasConfirmed) confirmed++;
    if (hasAborted) aborted++;

    // take first event as the “type”
    const first = arr[0];
    decisionCounts.set(first.decision, (decisionCounts.get(first.decision) ?? 0) + (hasPending ? 1 : 0));
    ruleCounts.set(first.rule_id, (ruleCounts.get(first.rule_id) ?? 0) + (hasPending ? 1 : 0));
  }

  const actionable = confirmed + aborted; // outcomes
  const outcomeConfirmRate = pct(confirmed, actionable);
  const executionRate = pct(confirmed, pending);


  console.log(`Unique interruptions (by interruption_id): ${interruptions}`);
  console.log(`Pending:   ${pending}`);
  console.log(`Confirmed: ${confirmed}`);
  console.log(`Aborted:   ${aborted}`);
  console.log(`Execution rate (confirmed / pending): ${executionRate}`);
  console.log(`Outcome confirm rate (confirmed / (confirmed+aborted)): ${outcomeConfirmRate}`);
  console.log("");

  console.log("Top decisions (counted by pending interruptions):");
  for (const [k, v] of topN(decisionCounts, 10)) {
    console.log(`- ${k}: ${v}`);
  }
  console.log("");

  console.log("Top rules (counted by pending interruptions):");
  for (const [k, v] of topN(ruleCounts, 10)) {
    console.log(`- ${k}: ${v}`);
  }
  console.log("");

  // Show last 5 events as sanity
  const last = [...events].sort((a, b) => (a.ts < b.ts ? -1 : 1)).slice(-5);
  console.log("Last events:");
  for (const e of last) {
    console.log(
      `- ${e.ts}  rule=${e.rule_id} decision=${e.decision} action=${e.user_action} id=${e.interruption_id ?? ""}`
    );
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
