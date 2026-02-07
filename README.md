# Decision Assistant

Decision Assistant is a **server-authoritative decision guardrail** for developers,
built as a Cursor MCP plugin.

It intervenes at **decision time**, not code time.

---

## What This Is

- A deterministic decision evaluation engine
- A guardrail that can **BLOCK**, **REQUIRE_CONFIRM**, or **ALLOW**
- A system that makes risky decisions **explicit, auditable, and confirmable**

This is **not**:
- an AI copilot
- a refactoring tool
- a recommendation engine

---

## Core Concept: Receipt-Based Confirmation (v0.2)

When a decision is risky but not blocked, the system issues a **receipt**.

A receipt is:
- **Random**
- **Single-use**
- **Bound to exactly one plan_hash**
- **Validated and consumed only by the server**

Lifecycle:

```
missing → active → consumed
```

All receipt semantics are defined in:

```
docs/receipt_semantics.md
```

This document is **non-negotiable** and defines frozen product semantics.

---

## Architecture Boundaries

- `assess()` is **pure**
- All persistence and validation happen in `server.ts`
- Receipts are stored locally as append-only JSONL:

```
~/.decision-assistant/receipts.jsonl
```

---

## Demo

Run the full roundtrip demo (positive + negative paths):

```bash
npx tsx examples/demo_guardrail_roundtrip.ts --auto --neg
```

This validates:

- normal confirmation
- stale plan_hash rejection
- invalid / replayed receipt rejection

---

## Status

- v0.2 receipt semantics: ✅ frozen
- server-authoritative lifecycle: ✅ implemented
- negative-path tests: ✅ passing

Next versions will **extend**, not redefine, these semantics.
