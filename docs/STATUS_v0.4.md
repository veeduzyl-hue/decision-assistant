# STATUS v0.4

## Status

**Decision Assistant v0.4 = structure-stable**

This document freezes the current repository status after the v0.4 hardening and convergence pass.

It is not a PRD and not a roadmap.  
Its purpose is to record the current stable state of the repository, clarify what has already been completed, and define the boundary before entering v0.5.

---

# 1. Version Meaning

Decision Assistant v0.4 marks the point where the project has converged from an experimental MCP tool into a **structure-stable developer infrastructure component**.

The repository now has:

- a frozen v1.0 scope boundary
- a converged repository structure
- deterministic assessment verification
- receipt-gated execution semantics
- replay protection
- append-only decision logs
- verification scripts and CI-aligned quality gates

v0.4 does **not** mean the project is feature-complete for v1.0.  
It means the project is now structurally stable enough to move into **contract freeze** work.

---

# 2. What Has Been Completed

## 2.1 Scope and product boundary

The project boundary has been frozen in:

- `docs/SCOPE_FREEZE_v1.0.md`
- `AGENTS.md`

Decision Assistant is now explicitly defined as:

> A deterministic MCP-based execution control component for AI coding workflows.

It is not positioned as:

- a general governance platform
- a responsibility attribution system
- a boundary declaration system
- a misuse-reporting product
- a UI/dashboard system
- a higher-level team or organization governance layer

## 2.2 Repository structure convergence

The repository has been converged toward the mainline structure:

- `src/modules/assess`
- `src/modules/risk`
- `src/modules/policy`
- `src/modules/receipt`
- `src/runtime`
- `src/audit`
- `src/persistence`
- `config/schema`

Legacy structure has been substantially reduced or removed.

## 2.3 Machine-contract convergence

The mainline machine-contract root is now:

- `config/schema`

Core schema surfaces have been established for:

- policy config
- receipt
- decision logs

The legacy `schemas/` root has been removed from the mainline path.

## 2.4 Runtime hardening

The runtime now includes:

- deterministic assessment flow
- receipt lifecycle support
- persistent receipt handling
- replay protection
- append-only decision logging
- verification coverage for the mainline execution path

## 2.5 Validation baseline

The following validations are passing at the v0.4 stable point:

- `npm run build`
- `npm run verify:machine-contracts`
- `npm run verify:guardrail`
- `npx tsx scripts/verify_determinism.ts`
- `npx tsx scripts/verify_replay_protection.ts`
- `npx tsx scripts/verify_receipt_lifecycle.ts`
- `npx tsx scripts/verify_decision_logs.ts`

## 2.6 Legacy cleanup

The following cleanup classes were completed during v0.4 convergence:

- empty files removed
- stale docs moved to archive
- stale examples moved to archive
- ad hoc legacy scripts moved to archive
- legacy schema root removed from mainline
- compatibility shim layers removed after validation
- obsolete repository paths reduced

---

# 3. What v0.4 Does Not Include

The following are intentionally **not** part of v0.4 mainline scope:

- responsibility binding as a required runtime object
- boundary declaration as a required runtime object
- misuse-report mainline behavior
- team approval workflows
- organization governance semantics
- dashboard or UI productization
- higher-level orchestration logic
- broad advisory or “AI CTO assistant” behavior

These areas remain out of scope for the v1.0 mainline unless explicitly re-approved.

---

# 4. Current Stable Definition

At the end of v0.4, Decision Assistant should be understood as:

> A deterministic MCP-based execution control component for AI coding workflows.

Its stable mainline responsibilities are:

- evaluate one action at a time
- return `WARN`, `REQUIRE_CONFIRM`, or `BLOCK`
- gate risky execution through receipts
- verify `receipt_id + plan_hash + nonce`
- reject replay and double-consume
- preserve append-only decision evidence

---

# 5. Known Constraints

## 5.1 SQLite warning

Current verification output may include a Node warning that SQLite support is still experimental.

This is not currently blocking v0.4 because:

- the validation suite passes
- the runtime behavior is stable enough for the current hardening stage

However, persistence surface and packaging implications should be reviewed in v0.5.

## 5.2 v0.4 is not contract-frozen yet

Although the repository is structure-stable, the following still require explicit freeze work in v0.5:

- final `assess` tool contract
- final receipt schema semantics
- final decision-log schema semantics
- final error semantics
- published package surface

---

# 6. Next Stage: v0.5

The next stage is:

## **Decision Assistant v0.5 = Contract Freeze + Packaging Stability**

The purpose of v0.5 is not to expand product scope, but to stabilize and freeze the mainline interfaces.

Expected focus areas:

- freeze `assess` contract
- freeze receipt schema semantics
- freeze decision-log schema semantics
- freeze error code semantics
- review npm package publishing surface
- verify install/use flows
- document migration and change boundaries

v0.5 should preserve the same product boundary established in v0.4.

---

# 7. Repository Guidance After v0.4

After this point:

1. Do not reintroduce higher-level governance semantics into mainline work.
2. Do not add responsibility/boundary/misuse runtime objects to the v1.0 mainline.
3. Prefer contract hardening over feature growth.
4. Keep schema, docs, tests, and runtime behavior aligned in the same change set.
5. Treat `docs/SCOPE_FREEZE_v1.0.md` as the source of truth for boundary decisions.

---

# 8. Final Statement

Decision Assistant v0.4 is the point at which the project becomes **structure-stable**.

The repository is no longer primarily an experimental tool layout.  
It is now a coherent infrastructure baseline for entering v0.5 contract freeze work.
