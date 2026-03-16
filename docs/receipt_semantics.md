# Receipt Semantics

**Status:** Normative
**Applies to:** Decision Assistant v1.0 mainline

This document defines the runtime semantics for receipt issuance, verification, replay protection, and receipt-backed execution.

---

## 1. Core Role

A receipt is a server-authoritative execution capability bound to:

- `receipt_id`
- `plan_hash`
- `nonce`

The server is the exclusive authority for:

- issuing receipts
- validating receipts
- consuming receipts
- rejecting replay

Clients may present receipts back to the server, but they must not infer lifecycle or validation state locally.

---

## 2. Receipt Lifecycle

A receipt must be in exactly one lifecycle state:

```text
missing -> active -> consumed
```

No additional lifecycle states are allowed.

TTL expiry is enforced as a validation failure against an `active` receipt. It does not introduce a separate lifecycle state.

---

## 3. Receipt Shape

The runtime receipt binding is:

```json
{
  "receipt_id": "gr_10af2f50c2ce",
  "plan_hash": "plan_97d4da118562",
  "nonce": "nonce_1234567890abcdef",
  "scope": "this_call_only"
}
```

Normative constraints:

- `receipt_id` must be random and unpredictable.
- `plan_hash` must bind the receipt to one computed execution plan.
- `nonce` must be single-use for the bound receipt and plan.
- `scope` is currently `this_call_only`.

---

## 4. Execution Verification

`EXECUTE` verification must check:

- `receipt_id`
- `plan_hash`
- `nonce`
- TTL validity
- lifecycle state

The server-authoritative execution key is:

```text
receipt_id + plan_hash + nonce
```

The first successful execution:

- verifies the bound receipt
- consumes the receipt atomically
- records the execution key in the replay index

Any later attempt with the same execution key must be rejected as replay.

---

## 5. Replay Protection

The runtime must reject:

- execution for a missing receipt
- execution for a consumed receipt
- execution after TTL expiry
- execution with mismatched `plan_hash`
- execution with mismatched `nonce`
- execution where the execution key already exists in the replay index

Replay protection must be backed by persistent storage so behavior remains correct across restart.

---

## 6. Purity Boundary

`assess()` must remain pure.

It must not:

- read receipt state
- read replay state
- perform storage I/O
- call transport or server layers

Receipt verification and consumption belong to the runtime and persistence layers, not the pure assessment module.

---

## 7. Persistence Authority

Authoritative runtime correctness must not depend on mutable in-memory state.

The mainline persistence layer must persist:

- receipts
- replay index entries
- append-only decision log events

Append-only decision logs are evidence, not authority. They must not be used to reconstruct receipt lifecycle state.

---

## 8. Enforcement Location

Receipt lifecycle and replay enforcement must reside in receipt/persistence boundaries, not in ad hoc transport-layer state.

This keeps execution control restart-safe, auditable, and reviewable.
