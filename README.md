# Decision Assistant

**Stop bad AI coding decisions before they execute.**

Decision Assistant is a **deterministic MCP-based execution control component for AI coding workflows**.
It evaluates one planned engineering action at a time, gates high-risk execution through receipts, rejects replay, and records append-only decision evidence.

- Deterministic assessment (**no LLM** in the decision path)
- Guardrail modes: `ALLOW` / `REQUIRE_CONFIRM` / `BLOCK`
- Receipt-gated execution bound to `receipt_id + plan_hash + nonce`
- Replay protection and append-only decision logs

---

## Scope / Direction

The source of truth for Decision Assistant's product boundary and v1.0 direction is [docs/SCOPE_FREEZE_v1.0.md](docs/SCOPE_FREEZE_v1.0.md).

If other documentation differs, follow `docs/SCOPE_FREEZE_v1.0.md`.

---

## What it does

Decision Assistant evaluates a single planned action and returns a **guardrail decision**:

- `ALLOW` — proceed
- `REQUIRE_CONFIRM` — blocked until explicit confirmation + receipt is provided
- `BLOCK` — hard stop (extreme safety valve / policy threshold exceeded)

In `REQUIRE_CONFIRM`, it returns a **receipt**:

```json
{
  "receipt": {
    "receipt_id": "gr_10af2f50c2ce",
    "plan_hash": "plan_97d4da118562",
    "nonce": "nonce_1234567890abcdef",
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
- `confirm.nonce` (must match the current receipt binding)

`EXECUTE` verification checks receipt existence, active state, TTL validity, `plan_hash`, `nonce`, and replay state.

If an active receipt already exists for the same `plan_hash`, the server may reuse
that receipt instead of issuing a new one.

Repeated `EXECUTE` with the same consumed execution key is rejected as replay.

---

## Install in Cursor (recommended: `npx`)

Add this to your Cursor MCP configuration:

```json
{
  "mcpServers": {
    "decision-assistant": {
      "command": "npx",
      "args": ["-y", "decision-assistant@0.3.1"]
    }
  }
}
```

Then restart Cursor.

### Verification

After restarting Cursor, you should see:

- `decision-assistant`
- `4 tools enabled`

### Notes

- This package is published on npm as `decision-assistant`.
- Pinning `@0.3.1` is recommended for reproducible verification.
- After validation, you may switch to `decision-assistant@latest`.

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

## Run tests

### Build

```bash
npm run build
```

### Machine contracts

```bash
npm run verify:machine-contracts
```

### Guardrail verification

```bash
npm run verify:guardrail
```

Expected: all pass.

---

## Server roundtrip evidence demo (v0.3d)

This repository includes a deterministic “server roundtrip” evidence demo that proves:

1. `REQUIRE_CONFIRM` issues `receipt_id` + `plan_hash`
2. `EXECUTE` succeeds only when the receipt matches the plan hash
3. stale confirmations are rejected and re-issued

### One command

```bash
npx tsx demo/demo_server_roundtrip.ts
```

Expected tail marker:

```text
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
- an MCP-based execution control component
- focused on single-action assessment and receipt-gated execution

It is **not**:

- a general governance platform
- a responsibility attribution system
- a boundary declaration system
- a misuse-reporting product
- a team approval workflow
- a UI/dashboard project

---

## Contributing

See `CONTRIBUTING.md`.

Key invariants you must not break:

- `assess()` stays **pure** (no fs/git/process/network)
- `receipt_id` must be random, not derived from plan hash or intent
- no extra lifecycle states beyond the normative set
- receipt consume must be atomic and replay must be rejected

---

## Troubleshooting

If you run:

```bash
npx decision-assistant@0.3.1
```

and nothing prints, this is **expected behavior**.

`decision-assistant` runs as an MCP stdio server and waits for a client (such as Cursor) to connect.  
It will not print interactive output when launched directly from the terminal.

If Cursor still shows old behavior after a code change:

- restart Cursor, or
- toggle the MCP server off/on in **Tools & MCP**, or
- temporarily pin the version explicitly in `.cursor/mcp.json`

---

## License

See `LICENSE`.
