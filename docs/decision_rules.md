# Decision Rules

This document describes the decision rules used by **Decision Assistant**.

Each rule encodes an engineering risk hypothesis and provides guidance
when a refactor is likely to become a time black hole.

---

## Rule philosophy

Decision rules are **advisory, not prescriptive**.

They are designed to:
- Surface hidden risk signals
- Encourage scoped, shippable action
- Normalize stopping when evidence is insufficient

Rules may return:
- A recommendation to proceed
- A recommendation to scope
- A recommendation to stop
- Or *no recommendation* when signal is weak

This is intentional.

---

## Rule lifecycle

Each rule should document:

1. **Trigger signals**
2. **Risk hypothesis**
3. **Threshold rationale**
4. **Expected intervention**

---

## Existing rules

### 1. Refactor Time Black Hole

**File:** `src/rules/refactor_time_black_hole.ts`

#### Trigger signals
- High number of files touched per change
- Long refactor duration without user-visible output
- Repeated refactor cycles on the same area

#### Risk hypothesis
Extended refactoring without delivery often leads to:
- Over-investment
- Scope creep
- Delayed feedback

#### Threshold rationale
Thresholds are tuned conservatively to avoid false positives.
The rule prefers *late but confident* intervention over early interruption.

#### Intervention
- Recommend a **scoped refactor**
- Enforce explicit exit criteria
- Encourage shipping a small slice first

---

## Adding a new rule

When adding a new rule:

1. Implement logic under `src/rules/`
2. Register the rule in the rule dispatcher
3. Add a section to this document describing:
   - Why the rule exists
   - What risk it addresses
   - How thresholds were chosen

Rules without documented rationale may be rejected.

---

## Future directions

Planned improvements include:
- Multi-rule aggregation
- Trend-based decision confidence
- Cross-rule conflict resolution

These will evolve as real-world usage data accumulates.
