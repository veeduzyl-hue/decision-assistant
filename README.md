# Decision Assistant

**Decision Assistant** is a deterministic decision infrastructure that helps
developers detect high-risk engineering behavior and enforce explicit execution
boundaries.

It is designed to answer a simple but critical question:

> *Should this change proceed as-is, require explicit confirmation, or be blocked?*

---

## Why Decision Assistant Exists

Many development risks are not caused by lack of intelligence, but by
**implicit execution**:

- Large refactors proceed without clear exit criteria
- Risk accumulates gradually and becomes invisible
- “Just one more change” crosses a cost boundary silently

Decision Assistant makes these boundaries **explicit, deterministic, and reviewable**.

---

## Core Concepts (v0.2)

### 1. Deterministic Decision Infra

Decision Assistant evaluates low-level engineering signals (e.g. change
amplification) and maps them into **policy actions**:

- `ALLOW`
- `WARN`
- `BLOCK`

This layer is fully deterministic and does not rely on LLM reasoning.

---

### 2. Guardrail with Explicit Confirmation

Policy actions are upgraded into **guardrail decisions**:

| policy.action | guardrail.action |
|---------------|------------------|
| `ALLOW`       | `ALLOW`          |
| `WARN`        | `REQUIRE_CONFIRM`|
| `BLOCK`       | `BLOCK`          |

When confirmation is required, execution is **paused by default**.

---

### 3. Guardrail Receipt Protocol

Instead of a boolean “confirm” flag, v0.2 introduces a **receipt-based protocol**.

When a guardrail requires confirmation, the tool returns a receipt:

```json
{
  "receipt_id": "gr_...",
  "plan_hash": "plan_...",
  "scope": "this_call_only"
}
```

Execution is only permitted when the caller explicitly confirms **the same plan**:

```json
{
  "confirm": {
    "mode": "EXECUTE",
    "receipt_id": "gr_...",
    "plan_hash": "plan_..."
  }
}
```

This prevents accidental or stale confirmations.

---

## Default Guardrail Thresholds

v0.2 ships with **stable defaults** for change amplification:

| files_touched | Behavior |
|---------------|----------|
| `< 8`         | Allow execution |
| `>= 8`        | Require explicit confirmation |
| `>= 16`       | Block execution |

These thresholds are treated as **defaults**, not user-tunable parameters in v0.2.

---

## Usage

### Build
```bash
npm run build
```

### Verify guardrail behavior
```bash
npm run verify:guardrail
```

### Test MCP assess flow
```bash
npx tsx scripts/mcp_call_assess.ts
npx tsx scripts/mcp_call_assess.ts --auto
```

---

## Design Principles

- **Determinism over heuristics**
- **Explicit confirmation over implicit execution**
- **Protocols over ad-hoc prompts**
- **Late but confident intervention**

Decision Assistant is not a linter, optimizer, or code generator.
It is an execution boundary.

---

## Documentation

- Guardrail Receipt Protocol: `docs/guardrail_protocol.md`
- Decision Rules: `docs/decision_rules.md`
- Configuration & defaults: `docs/config.md`

---

## Status

- Current version: **v0.2.0**
- Stability: Experimental but protocol-stable
- Intended users: Independent developers and small teams

---

## License

MIT
