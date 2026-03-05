# Decision Assistant

**Stop bad AI coding decisions before they execute.**

Decision Assistant is a **deterministic Cursor MCP server** that enforces decision‑time guardrails for risky engineering actions.
It does not “review” your code after the fact. It **interrupts execution at the moment of commitment** and emits a verifiable,
machine‑readable **evidence payload** (including a confirmation receipt when required).

- Deterministic rules (**no LLM** in the decision path)
- Guardrail modes: `ALLOW` / `REQUIRE_CONFIRM` / `BLOCK`
- Receipt semantics: **random `receipt_id`**, **plan‑bound `plan_hash`**, **idempotent consumption**
- Designed for “solo dev sanity” and CI‑grade evidence

---

## What it does

When a change looks dangerous (scope explosion, refactor black hole patterns, dependency churn, etc.),
Decision Assistant returns a **guardrail decision**:

- `ALLOW` — proceed
- `REQUIRE_CONFIRM` — blocked until explicit confirmation + receipt is provided
- `BLOCK` — hard stop (policy threshold exceeded)

In `REQUIRE_CONFIRM`, it returns a **receipt**:

```json
{
  "receipt": {
    "receipt_id": "gr_10af2f50c2ce",
    "plan_hash": "plan_97d4da118562",
    "scope": "this_call_only"
  },
  "confirmation": { "required": true },
  "executed": false
}
```

To proceed, re-run with:

- `confirm.mode = "EXECUTE"`
- `confirm.receipt_id` (must be reused)
- `confirm.plan_hash` (must match current plan hash)

If the plan changed, the EXECUTE is rejected and a **new receipt** is issued.

---

## Quick start with Cursor (recommended: `npx` install)

> **Goal:** run the MCP server locally and point Cursor to it **without cloning**.

### 1) Configure Cursor MCP

Add a server entry in Cursor MCP settings (UI varies by Cursor version).

**Recommended config (no absolute repo path):**

```json
{
  "mcpServers": {
    "decision-assistant": {
      "command": "npx",
      "args": ["-y", "decision-assistant"]
    }
  }
}
```

Restart Cursor after saving settings.

> Notes
> - This requires the package to be published to npm as `decision-assistant`.
> - If you publish under a scope, change the args to `["@your-scope/decision-assistant"]`.

---

## Local development (repo mode)

Use this when you are actively developing the server.

### 1) Clone + install

```bash
git clone https://github.com/veeduzyl-hue/decision-assistant
cd decision-assistant
npm install
npm run build
```

### 2) Configure Cursor MCP (dev)

Point Cursor to your locally built server:

```json
{
  "mcpServers": {
    "decision-assistant-dev": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_REPO>/dist/server.js"]
    }
  }
}
```

Example (Windows):

```json
{
  "mcpServers": {
    "decision-assistant-dev": {
      "command": "node",
      "args": ["D:/AI project/decision-assistant/dist/server.js"]
    }
  }
}
```

---

## Install / Build

```bash
npm install
npm run build
```

---

## Run semantic tests (receipt norms)

```bash
npm run test:semantics
```

Expected: all tests pass.

---

## Server roundtrip evidence demo (v0.3d)

This repository includes a deterministic “server roundtrip” evidence demo that proves:

1) `REQUIRE_CONFIRM` issues `receipt_id` + `plan_hash`
2) `EXECUTE` succeeds only when the receipt matches the plan hash (and reuses `receipt_id`)
3) stale confirmations are rejected and re-issued

### One command

```bash
npx tsx demo/demo_server_roundtrip.ts
```

Expected tail marker:

```
PASS: server roundtrip evidence
{ "ok": true, "bundle": "server-roundtrip-evidence", "version": "v0.3d" }
```

### CI-style check

```bash
npx tsx scripts/ci/server_roundtrip_check.ts
```

This fails the process if the evidence marker is missing or any step exits non-zero.

---

## How the demo is structured

- `demo/demo_require_confirm.ts`  
  Finds a signals payload that lands on `REQUIRE_CONFIRM`, prints full payload, and persists:
  - `demo/.demo_last.json` (last run context)
  - `demo/_evidence/1_require_confirm.json` (evidence artifact)

- `demo/demo_execute.ts`  
  Reads `demo/.demo_last.json` (or CLI args) and runs `EXECUTE` with the same receipt.

- `demo/demo_reject.ts`  
  Mutates the signals to force **plan_hash drift**, attempts EXECUTE with stale plan_hash, and validates rejection + reissue.

- `demo/demo_server_roundtrip.ts`  
  Runs all three demos in sequence and prints `PASS: server roundtrip evidence`.

---

## Project boundaries

Decision Assistant (this repo) is intentionally:

- deterministic
- local-first
- “decision infrastructure” for engineering behavior

It is **not**:

- a general LLM agent
- an auto-refactoring tool
- a product analytics platform

---

## Contributing

See `CONTRIBUTING.md`.

Key invariants you must not break:

- `assess()` stays **pure** (no fs/git/process/network)
- `receipt_id` must be random, not derived from plan hash or intent
- no extra lifecycle states beyond the normative set
- consumption must be idempotent

---

## License

See `LICENSE`.
