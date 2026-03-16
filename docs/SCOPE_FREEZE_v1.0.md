# Decision Assistant Scope Freeze v1.0

## Status

Frozen for v1.0 planning and implementation alignment.

## Purpose

This document freezes the product scope, architectural direction, and boundary conditions for **Decision Assistant v1.0**.

Its purpose is to prevent project drift and keep the system aligned with its core identity:

> **Decision Assistant is a developer infrastructure component for AI coding workflows.**
>
> It performs deterministic action assessment, gates execution through receipts, prevents replay, and records append-only decision logs.

This document is intentionally restrictive.  
Anything outside this scope is **not part of the v1.0 mainline** unless explicitly re-approved.

---

# 1. Product Identity

## 1.1 What Decision Assistant is

Decision Assistant is:

- an **MCP server**
- a **developer infrastructure component**
- an **action-level decision gate** for AI coding workflows
- a system that evaluates a single planned engineering action before execution
- a system that binds high-risk execution to a verifiable receipt
- a system that preserves decision evidence in append-only logs

## 1.2 What Decision Assistant is not

Decision Assistant is **not**:

- a general-purpose governance platform
- an organization-level policy system
- a responsibility attribution platform
- a team approval workflow system
- a misuse reporting product
- a boundary declaration system
- a UI dashboard product
- a broad “AI CTO assistant”
- a replacement for higher-level safety or governance systems

---

# 2. Scope Freeze Statement

For v1.0, the project is frozen to the following core mission:

```text
Deterministic assessment
+ Receipt-gated execution
+ Replay protection
+ Append-only decision logs
```

Everything in the v1.0 mainline must directly strengthen one or more of these four capabilities.

If a proposed feature does not strengthen one of these four, it is out of scope.

---

# 3. Core Problem

AI coding systems increase execution speed faster than human judgment quality.

The primary operational failure is not merely “bad code generation,” but:

- high-cost changes executed too quickly
- execution happening without stable confirmation semantics
- the original decision context disappearing
- repeated or replayed execution using stale authorization
- inability to reconstruct why a risky action was allowed

Decision Assistant exists to solve this problem at the **single-action execution boundary**.

---

# 4. Core Product Definition

## 4.1 Primary function

Decision Assistant evaluates a proposed code action and returns one of:

- `WARN`
- `REQUIRE_CONFIRM`
- `BLOCK`

If explicit confirmation is required, execution must be gated through a persistent receipt with verification semantics.

## 4.2 Main execution model

```text
ASSESS
  -> deterministic evaluation
  -> policy verdict

If verdict = REQUIRE_CONFIRM
  -> issue receipt
  -> bind execution to receipt_id + plan_hash + nonce

EXECUTE
  -> verify receipt
  -> verify plan_hash
  -> verify nonce
  -> reject replay
  -> consume receipt atomically
  -> append decision/execution logs
```

---

# 5. In-Scope for v1.0

The following are in scope.

## 5.1 Stateless MCP server

The server must be stateless in the infrastructure sense:

- no in-memory authoritative receipt state
- no reliance on process-local mutable state for correctness
- restart-safe behavior
- any instance can verify or consume receipts using persistent storage

## 5.2 Deterministic assessment

The system must produce stable results from stable inputs:

- deterministic signal normalization
- deterministic risk evaluation
- deterministic policy decision
- explicit engine/policy versioning
- repeatable output under the same inputs and versions

## 5.3 Receipt-gated execution

High-risk execution must be protected by a verifiable receipt model:

- receipt issuance
- receipt verification
- receipt TTL
- receipt lifecycle states
- plan binding through `plan_hash`
- nonce-based validation
- active receipt reuse only if explicitly valid under the same semantics

## 5.4 Replay protection

The system must block:

- duplicate EXECUTE with same authorization
- stale or copied receipt reuse
- execution after receipt consumption
- execution after TTL expiry
- execution with mismatched `plan_hash`
- execution with invalid nonce
- race-condition double consume

## 5.5 Append-only decision logs

The system must record governance-grade decision evidence as append-only events, including:

- decision assessment
- receipt issuance
- receipt reuse
- execution acceptance
- execution rejection
- receipt consumption

## 5.6 Persistent storage

The system must persist at least:

- receipts
- replay index
- decision logs

## 5.7 Verification and replay tooling

The repository must include verification utilities for:

- determinism
- replay protection
- receipt lifecycle
- decision log validity
- offline decision replay

---

# 6. Explicitly Out of Scope for v1.0

The following are frozen out of the v1.0 mainline.

## 6.1 Responsibility binding as a required runtime object

Not in scope:

- `responsibility.schema.json` as a required execution primitive
- “EXECUTE must include formal responsibility binding” as a v1.0 contract
- responsibility-centric product semantics

This may exist only as a future extension or experimental artifact.

## 6.2 Boundary declaration as a required runtime object

Not in scope:

- `boundary.schema.json` as a required confirmation primitive
- “CONFIRM must include boundary declaration” as a v1.0 contract
- boundary-driven execution semantics

This may exist only as a future extension or experimental artifact.

## 6.3 Misuse report as a mainline product capability

Not in scope:

- `misuse_report.schema.json` as a core runtime artifact
- misuse reporting as a primary feature
- “misuse can only be exposed, not guided” as a v1.0 product pillar

This belongs, if anywhere, in an optional extension layer.

## 6.4 Team governance and approval workflow

Not in scope:

- multi-user approval chains
- role-based approval routing
- team review queues
- organization governance dashboards

## 6.5 High-level advisory productization

Not in scope:

- generalized strategic advice
- broad engineering health diagnosis as the core runtime
- acting as a broad “AI CTO” or “engineering leadership” assistant

## 6.6 Broad product expansion

Not in scope:

- new product lines
- UI-first surfaces
- SaaS platform behavior
- market/category expansion through v1.0 mainline scope

---

# 7. Non-Overlap Boundary

Decision Assistant must remain clearly distinct from any higher-level governance or safety system.

## 7.1 Decision Assistant owns

Decision Assistant owns only the **single-action execution boundary**:

- evaluate one action
- decide whether it needs confirmation
- issue/verify/consume execution receipt
- prevent replay
- preserve append-only evidence

## 7.2 Decision Assistant does not own

Decision Assistant does not own:

- long-horizon policy reasoning
- team or organization governance
- higher-order safety semantics
- responsibility doctrine
- persistent behavioral pattern adjudication
- system-wide governance orchestration

If a feature starts answering questions like:

- “Who is responsible in the long-term?”
- “What behavioral classes should be allowed across the system?”
- “How should teams or organizations govern agent behavior?”

then that feature is outside the mainline Decision Assistant scope.

---

# 8. v1.0 Product Requirements

## 8.1 Required inputs

The mainline request contract is centered on action assessment and execution verification.

Representative request shape:

```ts
type AssessRequest = {
  action: "ASSESS" | "EXECUTE";
  intent: string;
  files_touched: string[];
  diff_lines_total: number;
  ship_gap_days: number;
  plan?: unknown;
  plan_hash?: string;
  receipt_id?: string;
  nonce?: string;
  confirm?: "EXECUTE";
  actor_id?: string;
  session_id?: string;
  request_id?: string;
};
```

## 8.2 Required outputs

Representative response shape:

```ts
type AssessResponse = {
  ok: boolean;
  verdict: "WARN" | "REQUIRE_CONFIRM" | "BLOCK" | "EXECUTE_ACCEPTED";
  message: string;
  reason_codes: string[];
  receipt_id?: string;
  plan_hash?: string;
  expires_at?: string;
  decision_id: string;
  audit_id?: string;
};
```

## 8.3 Required module classes

The system must include these mainline modules:

- MCP Tool Layer
- Runtime Orchestrator
- Risk Engine
- Policy Engine
- Receipt Engine
- Audit Layer
- Persistence Layer

---

# 9. Required Architectural Properties

## 9.1 Statelessness

Server correctness must survive restart and scale-out.

## 9.2 Determinism

Same input + same versions = same result.

## 9.3 Atomic receipt consume

At most one successful consume for the same receipt.

## 9.4 Replay resistance

Receipt + plan + nonce combination cannot be reused illegitimately.

## 9.5 Auditability

Every meaningful decision and execution outcome must be evidentiary.

## 9.6 Replayability

Historic decisions must be reconstructable offline.

---

# 10. Required Version Freeze Objects

The following must become stable contracts by v1.0:

- `assess` tool contract
- policy config schema
- receipt schema
- decision log schema
- receipt lifecycle semantics
- replay protection semantics
- error code semantics
- plan canonicalization semantics

---

# 11. Repository Direction

The repository should evolve toward the following structure:

```text
decision-assistant/
├─ README.md
├─ docs/
│  ├─ SCOPE_FREEZE_v1.0.md
│  ├─ architecture.md
│  ├─ semantics.md
│  ├─ determinism.md
│  ├─ replay-protection.md
│  └─ audit-log.md
│
├─ config/
│  ├─ policy.default.json
│  └─ schema/
│     ├─ policy-config.schema.json
│     ├─ receipt.schema.json
│     └─ decision-log.schema.json
│
├─ src/
│  ├─ server.ts
│  ├─ modules/
│  │  ├─ assess/
│  │  ├─ risk/
│  │  ├─ policy/
│  │  └─ receipt/
│  ├─ runtime/
│  ├─ audit/
│  ├─ persistence/
│  ├─ infra/
│  └─ types/
│
├─ evidence/
│  ├─ fixtures/
│  └─ demo/
│
├─ scripts/
│  ├─ verify_determinism.ts
│  ├─ verify_replay_protection.ts
│  ├─ verify_receipt_lifecycle.ts
│  ├─ verify_decision_logs.ts
│  └─ replay_decision.ts
│
└─ .github/
   └─ workflows/
      ├─ determinism.yml
      ├─ replay_protection.yml
      ├─ receipt_lifecycle.yml
      └─ audit_logs.yml
```

---

# 12. Change Control Rules

Any future proposal must be rejected from the v1.0 mainline if it:

- introduces new high-level governance semantics
- expands into responsibility/boundary/misuse systems
- changes the product from action gate to governance platform
- weakens determinism
- weakens receipt binding
- weakens replay protection
- weakens append-only logging
- depends on broad advisory behavior rather than execution control

Any such proposal must be treated as one of:

- future extension
- experimental layer
- separate project
- post-v1.0 exploration

---

# 13. Final Freeze Statement

Decision Assistant v1.0 is frozen as:

> **A deterministic MCP-based execution control component for AI coding workflows.**

It assesses one action at a time, gates risky execution through receipts, prevents replay, and records append-only evidence.

It does **not** expand into higher-level governance semantics in the v1.0 mainline.

That boundary is intentional and must be preserved.
