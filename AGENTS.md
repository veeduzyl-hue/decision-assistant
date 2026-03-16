# AGENTS.md

## Project identity

This repository is for **Decision Assistant**.

Decision Assistant is a **deterministic MCP-based execution control component for AI coding workflows**.

It is **not**:
- a general governance platform
- a responsibility attribution system
- a boundary declaration system
- a misuse-reporting product
- a team approval workflow
- a UI/dashboard project

Always preserve the product boundary defined in:
- `docs/SCOPE_FREEZE_v1.0.md`

If a proposed change expands the repo beyond:
- deterministic assessment
- receipt-gated execution
- replay protection
- append-only decision logs

then the change is out of scope for the v1.0 mainline.

---

## Mainline rules

When making changes in this repository, always follow these rules:

1. Keep scope tight.
   - Do not introduce new product directions.
   - Do not add high-level governance semantics.
   - Do not add `responsibility`, `boundary`, or `misuse_report` as required runtime objects.

2. Preserve the core runtime model.
   - `ASSESS` performs deterministic evaluation.
   - `REQUIRE_CONFIRM` may issue a receipt.
   - `EXECUTE` must verify `receipt_id + plan_hash + nonce`.
   - Execution must reject replay and double-consume.
   - Decision evidence must be append-only.

3. Prefer infrastructure hardening over feature expansion.
   - Statelessness
   - persistence correctness
   - replay protection
   - deterministic behavior
   - auditability
   - restart safety

4. Keep diffs reviewable.
   - Make minimal, focused changes.
   - Do not mix refactors with unrelated behavior changes.
   - If a larger refactor is required, state why clearly.

5. Do not silently change contracts.
   - If changing schemas, interfaces, or error semantics, update related docs and tests in the same task.
   - Preserve backward compatibility unless the task explicitly authorizes a breaking change.

---

## Architecture direction

The repository should converge toward this structure:

- `src/modules/assess`
- `src/modules/risk`
- `src/modules/policy`
- `src/modules/receipt`
- `src/runtime`
- `src/audit`
- `src/persistence`
- `config/schema`
- `docs/`

Prefer moving code toward this structure when working in adjacent areas.

---

## Required runtime properties

Every mainline implementation must strengthen or preserve:

- deterministic assessment
- persistent receipt lifecycle
- replay protection
- append-only decision logs
- restart safety
- atomic receipt consume

Do not add logic that depends on mutable in-memory state for correctness.

Do not add nondeterministic behavior to scoring or policy decisions.

---

## Validation expectations

Before finishing a task:

1. Run the smallest relevant tests first.
2. Run repository-wide validation if the task changes shared contracts or core runtime code.
3. Report exactly what was run and what passed/failed.
4. If validation fails, fix the failure before concluding unless the user explicitly asked for draft-only work.

If the repo already contains project scripts, prefer them.

Target validation scripts for this repo include:

- `scripts/verify_determinism.ts`
- `scripts/verify_replay_protection.ts`
- `scripts/verify_receipt_lifecycle.ts`
- `scripts/verify_decision_logs.ts`
- `scripts/replay_decision.ts`

If these scripts do not exist yet and the task is about hardening the repo, create them.

---

## Documentation requirements

When changing core behavior, update the relevant docs if present:

- `docs/SCOPE_FREEZE_v1.0.md`
- `docs/architecture.md`
- `docs/semantics.md`
- `docs/determinism.md`
- `docs/replay-protection.md`
- `docs/audit-log.md`

Do not create broad product-strategy documents in implementation tasks.

---

## Coding guidance

- Prefer explicit types.
- Prefer pure functions for evaluation logic.
- Keep policy and receipt semantics versioned.
- Keep persistence boundaries clear through repository interfaces.
- Avoid hidden coupling between MCP handler code and storage internals.
- Make failure modes explicit with stable error codes.

---

## When uncertain

If a task is ambiguous, choose the interpretation that:
1. keeps Decision Assistant within v1.0 scope,
2. improves infrastructure reliability,
3. avoids overlap with higher-level governance systems,
4. keeps the diff small and testable.