# Product Boundary — Phase 1 (Cold Rules)

This document defines the **explicit product boundaries** of Decision Assistant
in **Phase 1**.

Phase 1 is intentionally strict, limited, and opinionated.
Any change that violates these boundaries must be postponed to Phase 2 or later.

---

## What Phase 1 IS

Phase 1 is a **Cold Decision Guard** for individual developers.

Its sole purpose is to:

- Interrupt high-risk engineering behavior
- Force an explicit decision at critical moments
- Prevent silent time sinks and momentum traps

Phase 1 intervenes **at decision time**, not code time.

---

## What Phase 1 DOES

Phase 1 **only** does the following:

- Evaluate a small set of deterministic **Cold Rules**
- Detect obvious high-risk patterns in the current action
- Trigger a hard interruption (WARN / REQUIRE_CONFIRM / BLOCK)
- Require explicit user acknowledgment before continuing

Characteristics:

- Cold-first execution
- Single-hit semantics (only one rule fires per evaluation)
- Deterministic, rule-based, no LLM
- Minimal explanation, no optimization advice

---

## What Phase 1 DOES NOT Do (Hard No)

Phase 1 explicitly does **NOT**:

- ❌ Optimize code or suggest refactors
- ❌ Explain detailed risk scores or breakdowns
- ❌ Provide dashboards, charts, or analytics
- ❌ Allow user-defined thresholds or rule editing
- ❌ Act as a friendly assistant or coding partner
- ❌ Accumulate or display long-term behavior insights
- ❌ Perform semantic reasoning or goal interpretation via LLMs

If a feature requires:
- interpretation,
- persuasion,
- explanation,
- or customization,

it does **not** belong in Phase 1.

---

## Cold Rules Constraints

Phase 1 Cold Rules must satisfy all of the following:

- Deterministic (same input → same outcome)
- Immediately observable from current signals
- High confidence, low false-positive tolerance
- Binary outcome: intervene or do nothing

If a rule requires historical aggregation, trend analysis,
or post-hoc interpretation, it belongs to Phase 2.

---

## Guardrail Semantics

Phase 1 interventions use **guardrail semantics**:

- `BLOCK` — execution must stop
- `WARN / REQUIRE_CONFIRM` — execution requires explicit confirmation
- No soft suggestions
- No “maybe later” paths

The system is allowed to be annoying.
The system is not allowed to be ambiguous.

---

## Phase Scope

- Phase 1 targets **individual developers**
- Team governance, shared rules, dashboards, and policy DSLs
  are explicitly out of scope

These belong to later phases.

---

## Change Policy

Any pull request or feature that expands Phase 1 beyond
the boundaries defined in this document must be rejected
or deferred to a future phase.

This constraint is intentional.

Discipline is the product.
