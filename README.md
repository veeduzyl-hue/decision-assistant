# Decision Assistant

Decision Assistant is a Cursor MCP plugin that enforces **decision receipts** —
a server-authoritative mechanism that makes high-risk engineering decisions
explicit, auditable, and non-repeatable.

This tool does **not** suggest what you should do.
It decides whether an action is allowed to proceed.

---

## What This Is

Decision Assistant is a **decision interruption layer**.

When risky conditions are detected, execution is stopped and replaced with a
**receipt-based confirmation flow**. Only an explicit, verified receipt can
unlock execution.

This is designed for:
- Independent developers
- Small engineering teams
- High-leverage refactors and architectural changes

---

## Core Concept: Decision Receipts

A **receipt** represents a single, explicit authorization to proceed with a
specific execution plan.

### Receipt Properties (Frozen Since v0.3)

- **receipt_id**
  - Random, one-time identifier
  - Not derived from plan content
  - Not reusable

- **plan_hash**
  - Deterministic hash of the evaluated execution plan
  - Changes if the plan changes

- **Lifecycle (Server-Authoritative)**
  ```
  missing → active → consumed
  ```

Once consumed, a receipt can never be reused.

These semantics are **normatively frozen** and enforced by tests.

---

## Why Receipts (Not Prompts, Not Suggestions)

Most AI tools *advise*.
Decision Assistant *enforces*.

Receipts ensure:
- No silent retries
- No accidental replays
- No client-side overrides
- Clear accountability at the moment of execution

This shifts AI from “assistant” to **execution boundary**.

---

## Architecture Overview

- **detect_triggers**
  Collects and normalizes signals (may use I/O).

- **assess (PURE)**
  Computes risk and guardrail decisions.
  - No I/O
  - No state reads
  - Fully deterministic

- **Server (Authoritative)**
  - Issues receipts
  - Validates confirmations
  - Consumes receipts
  - Persists append-only evidence

---

## Receipt Semantics (Frozen)

The following are **non-negotiable invariants**:

- receipt validation and consumption occur **only on the server**
- assess() must remain a pure function
- no additional receipt lifecycle states may be introduced
- clients must never infer receipt state

Any change violating these rules is a **breaking change**.

---

## Versioning

- **v0.3** — Receipt semantics frozen
- Future versions may extend rules, signals, or UX
- Receipt semantics will not change without an explicit major version bump

---

## This Is Not

- ❌ A refactoring assistant
- ❌ A code generator
- ❌ A suggestion engine
- ❌ A productivity chatbot

This is a **discipline tool**.

---

## Status

- Receipt semantics: ✅ Frozen and enforced
- Roundtrip demo: ✅ PASS
- CI semantic guards: ✅ Active

---

## Philosophy

> Execution should be easy.
> Decisions should be expensive.

Decision Assistant exists to enforce that difference.
