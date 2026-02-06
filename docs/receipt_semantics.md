# Receipt Semantics (v0.2)

This document defines the **product-correct, non-negotiable semantics**
of Guardrail Receipts.

---

## Core Concepts

- **plan_hash**  
  Deterministic hash of the evaluated decision plan.  
  Answers: *“What exactly is being confirmed?”*

- **receipt_id**  
  Random, single-use confirmation ticket.  
  Answers: *“Which confirmation instance is being consumed?”*

**Invariant:**  
`receipt_id MUST be random and MUST NOT be derived from plan_hash.`  
A receipt binds to exactly one plan_hash.

---

## Receipt Object

```ts
{
  receipt_id: string,        // random, unpredictable
  plan_hash: string,         // deterministic
  scope: "this_call_only"    // v0.2 default
}
```

---

## Lifecycle (Server-Authoritative)

State machine:

```

missing → active → consumed
```

### Issue (REQUIRE_CONFIRM)

- Server returns `guardrail.action=REQUIRE_CONFIRM` with `{ receipt_id, plan_hash }`
- Server records an `issue` event

### Execute (confirm: EXECUTE)

Server MUST validate:

1. `receipt_id` exists and is **active**
2. `receipt_id` is bound to the same `plan_hash`

- If valid → record `consume`, return `ALLOW`
- If invalid → **reject** and return a **new REQUIRE_CONFIRM with a new receipt**

---

## Store (Local-only)

Append-only JSONL store:

```
$HOME/.decision-assistant/receipts.jsonl
```

Each line is an event:

```json
{
  "ts": "ISO-8601",
  "action": "issue" | "consume",
  "receipt_id": "...",
  "plan_hash": "...",
  "scope": "this_call_only"
}
```

**Authority boundary:**

- Server enforces lifecycle and persistence
- `assess()` is pure and MUST NOT write files

---

## Rejection Classes (Minimum)

- plan changed / stale (`plan_hash` mismatch)
- receipt missing
- receipt already consumed
- receipt bound to a different plan

---

## Rationale (Non-Optional)

If `receipt_id` is derived from `plan_hash`,
it ceases to be a ticket instance and becomes a predictable check field.

This collapses replay protection and breaks future requirements
(concurrency, multiple scopes, parallel confirmations).
