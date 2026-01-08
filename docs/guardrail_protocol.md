# Guardrail Receipt Protocol (v0.2)

This document specifies the **public contract** for the Guardrail two-step receipt confirmation behavior,
plus **implementer notes** for maintainers.

---

## Public Contract

### 1. Purpose

Guardrail introduces an explicit, auditable confirmation step for risky operations.

- Prevents accidental execution when risk is high.
- Binds user intent to a **specific execution plan** via a receipt.
- Enforces deterministically (no LLM involvement).

---

### 2. Guardrail States

Guardrail exposes exactly **three externally visible states**.

| State            | Meaning |
|------------------|---------|
| `ALLOW`          | Execution is permitted. |
| `REQUIRE_CONFIRM`| Execution is allowed only after explicit confirmation using a receipt. |
| `BLOCK`          | Execution is forbidden. Inputs must be changed before retry. |

#### 2.1 Valid State Transitions

```
BLOCK
  └─X─> execution (not allowed)

REQUIRE_CONFIRM ──(valid receipt confirmation)──> ALLOW
```

Rules:

- `BLOCK` cannot transition directly to execution.
- `REQUIRE_CONFIRM` requires a valid receipt confirmation.
- Only `ALLOW` permits execution.

---

### 3. Receipt

A **receipt** represents a confirmable execution opportunity.
It binds user intent to a specific computed plan.

#### 3.1 Receipt Shape

```json
{
  "receipt_id": "gr_0f4f9a816f64",
  "plan_hash": "plan_eefc62edd807",
  "scope": "this_call_only"
}
```

Field semantics:

- `receipt_id`: Opaque identifier for this confirmation opportunity.
- `plan_hash`: Hash of the execution plan being confirmed.
- `scope`: Validity scope of the receipt (currently `this_call_only`).

---

### 4. Confirm Payload

When Guardrail responds with `REQUIRE_CONFIRM`, the caller may provide a `confirm` payload.

#### 4.1 ConfirmInput

```ts
type ConfirmInput =
  | {
      mode: "ACK";
      receipt_id?: string;
      plan_hash?: string;
    }
  | {
      mode: "EXECUTE";
      receipt_id: string;
      plan_hash: string;
    };
```

#### 4.2 Confirmation Modes

| Mode | Semantics |
|-----|-----------|
| `ACK` | Acknowledge receipt only. **Does not allow execution.** |
| `EXECUTE` | Explicitly confirm and allow execution. |

Rules:

- `EXECUTE` **must** provide both `receipt_id` and `plan_hash`.
- If `plan_hash` does not match the current plan, confirmation is rejected.

---

### 5. Guardrail Response Contract

A Guardrail response **must** include a `guardrail` field.

#### 5.1 REQUIRE_CONFIRM Response (excerpt)

```json
{
  "guardrail": {
    "action": "REQUIRE_CONFIRM",
    "reason": "High change amplification detected (files_touched=10).",
    "receipt": {
      "receipt_id": "gr_0f4f9a816f64",
      "plan_hash": "plan_eefc62edd807",
      "scope": "this_call_only"
    },
    "executed": false,
    "confirmation": {
      "required": true
    }
  }
}
```

#### 5.2 ALLOW Response after Confirmation (excerpt)

```json
{
  "guardrail": {
    "action": "ALLOW",
    "reason": "User confirmed execution for plan_hash plan_eefc62edd807.",
    "receipt": {
      "receipt_id": "gr_0f4f9a816f64",
      "plan_hash": "plan_eefc62edd807",
      "scope": "this_call_only"
    },
    "executed": true,
    "confirmation": {
      "required": false,
      "confirmed": true,
      "confirmed_plan_hash": "plan_eefc62edd807",
      "confirmed_receipt_id": "gr_0f4f9a816f64"
    }
  }
}
```

---

### 6. Example Flow

#### 6.1 PASS 1 (no confirm)

**Request**

```json
{
  "signals": { "files_touched": 10 }
}
```

**Response (excerpt)**

```json
{
  "guardrail": {
    "action": "REQUIRE_CONFIRM",
    "reason": "High change amplification detected (files_touched=10).",
    "receipt": {
      "receipt_id": "gr_0f4f9a816f64",
      "plan_hash": "plan_eefc62edd807",
      "scope": "this_call_only"
    },
    "executed": false,
    "confirmation": { "required": true }
  }
}
```

#### 6.2 PASS 2 (confirm EXECUTE)

**Request**

```json
{
  "signals": { "files_touched": 10 },
  "confirm": {
    "mode": "EXECUTE",
    "receipt_id": "gr_0f4f9a816f64",
    "plan_hash": "plan_eefc62edd807"
  }
}
```

**Response (excerpt)**

```json
{
  "guardrail": {
    "action": "ALLOW",
    "reason": "User confirmed execution for plan_hash plan_eefc62edd807.",
    "receipt": {
      "receipt_id": "gr_0f4f9a816f64",
      "plan_hash": "plan_eefc62edd807",
      "scope": "this_call_only"
    },
    "executed": true,
    "confirmation": {
      "required": false,
      "confirmed": true,
      "confirmed_plan_hash": "plan_eefc62edd807",
      "confirmed_receipt_id": "gr_0f4f9a816f64"
    }
  }
}
```

---

## Implementer Notes (Non-Normative)

### I. Stability Guarantees

The receipt protocol is designed to be stable across tools.

Do **not** include non-gating, high-churn fields in `plan_hash` computation.

**Recommended inputs for `plan_hash`:**

- `infraSignals` (only gating-related)
- `policy.action`, `policy.reason`, `policy.suggestedExits`
- `guardrail.action`, `guardrail.reason`

**Avoid:**

- timestamps
- random IDs
- verbose nested outputs unrelated to gating

---

### II. Plan Hash Construction (Guideline)

- Use stable key ordering (stable stringify).
- Hash with SHA-256 and truncate to a fixed length.
- Prefix with `plan_` for readability.

---

### III. UX Guidance

- Two-step confirmation should be an **explicit user choice**, not the default.
- Provide a clear **“Confirm & Execute”** action that sends
  `confirm.mode = "EXECUTE"` with the latest receipt.

---

### IV. Future Extensions (Non-Normative)

Potential future additions:

- `EXECUTE_DRY_RUN` (continue pipeline without side-effects)
- Multi-scope receipts (e.g., session scope)
- Receipt persistence for audit logs
