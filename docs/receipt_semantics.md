# Receipt Semantics — Normative Specification

**Status:** Normative  
**Applies to:** Decision Assistant v0.2+  
**Last reviewed:** v0.3 planning phase  

This document defines **non-negotiable semantic constraints** for the receipt
mechanism used by Decision Assistant.  
Any implementation, refactor, optimization, or extension **MUST** comply with
this specification unless explicitly versioned out.

---

## 1. Definitions

### 1.1 Receipt

A **receipt** is a **server-authoritative, single-use decision ticket** issued
by the Decision Assistant server to allow or confirm a guarded action.

A receipt is **not**:
- a decision,
- a recommendation,
- a log entry,
- a state snapshot,
- a derived artifact.

It is a **capability token** with strictly bounded semantics.

---

### 1.2 Receipt Identifier (`receipt_id`)

A `receipt_id` is the **sole identifier** of a receipt.

**Normative constraints:**

- `receipt_id` **MUST** be:
  - randomly generated,
  - cryptographically unpredictable,
  - single-use.
- `receipt_id` **MUST NOT** be:
  - derived from `plan_hash`,
  - derived from intent content,
  - reversible or guessable,
  - stable across runs or retries.

> Any implementation deriving `receipt_id` from deterministic inputs
> **violates this specification**.

---

## 2. Authority Model

### 2.1 Server Authority

The server is the **exclusive authority** for:

- receipt issuance,
- receipt validation,
- receipt consumption,
- receipt lifecycle transitions.

Clients **MUST NOT** infer, reconstruct, or simulate receipt state.

---

### 2.2 Client Role

Clients may:
- hold a `receipt_id`,
- present a `receipt_id` to the server,
- record local evidence of receipt-related events.

Clients **MUST NOT**:
- validate a receipt,
- consume a receipt,
- infer receipt lifecycle state,
- restore receipt state from local artifacts.

---

## 3. Receipt Lifecycle

### 3.1 Lifecycle States

A receipt **MUST** be in exactly one of the following states:

```
missing → active → consumed
```

No other lifecycle states are permitted.

Specifically:
- `expired`
- `revoked`
- `invalidated`
- `pending`

**MUST NOT** be introduced as lifecycle states.

If expiration or policy rejection is implemented, it **MUST** be expressed as
a **server-side validation failure**, not as a new lifecycle state.

---

### 3.2 State Semantics

- **missing**
  - The receipt does not exist or is unknown to the server.
- **active**
  - The receipt exists and is eligible for consumption.
- **consumed**
  - The receipt has been irreversibly used.

State transitions are **monotonic** and **irreversible**.

---

## 4. Receipt Consumption

### 4.1 Server-Side Consumption Only

Receipt consumption **MUST** occur exclusively on the server.

Clients **MUST NOT** mark a receipt as consumed under any circumstances.

---

### 4.2 Idempotency (Mandatory)

Receipt consumption **MUST be idempotent**.

Given the same `receipt_id`:

- The **first successful consume** transitions:
  ```
  active → consumed
  ```
- Any subsequent consume attempts **MUST**:
  - return `state = consumed`,
  - indicate idempotent handling,
  - **MUST NOT** produce an error solely due to duplication.

Idempotency is required to guarantee correctness under retries,
network jitter, or concurrent calls.

---

### 4.3 Validation Failures

Consumption attempts **MUST** fail explicitly when:

- the receipt is `missing`,
- the receipt is invalid,
- server-side policy rejects the request.

Failures **MUST NOT** be inferred from client-side state.

---

## 5. Purity of Assessment

### 5.1 `assess()` Purity

The `assess()` function **MUST remain pure**.

Specifically, `assess()`:

- **MUST NOT**:
  - read receipt state,
  - read local logs or artifacts,
  - perform I/O,
  - call the server.
- **MAY**:
  - evaluate inputs,
  - compute risk,
  - produce advisory output.

Receipt issuance or consumption **MUST NOT** occur inside `assess()`.

---

## 6. Local Artifacts and Logs

### 6.1 Append-Only Logs (JSONL)

Local append-only logs (e.g. `decisions.log.jsonl`) are **evidence records**, not
state.

They may record events such as:
- receipt issued,
- receipt presented,
- receipt consumed (acknowledged),
- receipt errors.

They **MUST NOT** be used to:

- infer receipt lifecycle state,
- restore receipt state,
- validate or invalidate receipts.

> Any implementation that reconstructs receipt state from local logs
> **violates this specification**.

---

### 6.2 Local State Files

Local state files (e.g. `state.json`) are **non-authoritative**.

They **MUST NOT** be treated as:
- receipt storage,
- lifecycle sources,
- recovery mechanisms.

Receipt authority **never** resides in client storage.

---

## 7. Binding and Intent Association

A receipt **MAY** be associated server-side with contextual metadata
(e.g. intent, constraints, issuance context).

However:

- Such association **MUST NOT** be relied upon client-side for validation.
- Clients **MUST NOT** compare `receipt_id` against plan hashes or intent data
  to determine validity.

All binding checks **MUST** occur on the server at consumption time.

---

## 8. Forbidden Designs (Normative)

The following designs are explicitly forbidden:

1. Deriving `receipt_id` from `plan_hash` or intent data.
2. Client-side receipt validation or lifecycle inference.
3. Receipt consumption outside the server.
4. Introducing additional receipt lifecycle states.
5. Reconstructing receipt state from local logs or files.
6. Making `assess()` depend on receipt state or server calls.

Any implementation employing these designs is **non-compliant**.

---

## 9. Versioning and Compliance

This specification applies to all versions **≥ v0.2** unless explicitly
superseded by a versioned replacement.

Breaking this specification **requires**:
- an explicit version bump,
- a written justification,
- a documented migration path.

Silent deviation is not permitted.

### Receipt Lifecycle Enforcement Location

Receipt lifecycle enforcement MUST reside in guardrail-level modules.
It MUST NOT be implemented in orchestration, transport, or server entrypoint layers.

This constraint exists to prevent semantic drift caused by flow-level refactors.

---

**End of Normative Specification**
