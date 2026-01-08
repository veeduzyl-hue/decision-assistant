# Decision Rules

This document describes the **decision rules and deterministic guardrail logic**
used by **Decision Assistant**.

Rules encode engineering risk hypotheses and provide structured guidance when
development behavior shows signs of excessive cost, uncertainty, or stagnation.

---

## 1. Rule Philosophy

Decision rules are **advisory, not prescriptive**.

They are designed to:

- Surface hidden or accumulating risk signals
- Encourage scoped, shippable action
- Normalize stopping or slowing down when evidence is insufficient

Rules may result in:

- A recommendation to proceed
- A recommendation to scope or validate
- A recommendation to stop
- Or **no recommendation** when signals are weak

This is intentional.

Decision Assistant prioritizes **late but confident intervention**
over early or noisy interruption.

---

## 2. Rule Lifecycle

Each rule should explicitly document:

1. **Trigger signals**
2. **Risk hypothesis**
3. **Threshold rationale**
4. **Expected intervention**

Rules without documented rationale should be treated as experimental.

---

## 3. Existing Rules

### 3.1 Refactor Time Black Hole

**Source:** `src/rules/refactor_time_black_hole.ts`

#### Trigger Signals

- High number of files touched per change
- Long refactor duration without user-visible delivery
- Repeated refactor cycles on the same area

#### Risk Hypothesis

Extended refactoring without delivery often leads to:

- Over-investment
- Scope creep
- Delayed or distorted feedback loops

#### Threshold Rationale

Thresholds are tuned conservatively to reduce false positives.

The rule prefers **late but confident intervention**
over early interruption based on weak signals.

#### Expected Intervention

- Recommend a **scoped refactor**
- Encourage explicit exit criteria
- Promote shipping a small slice first

---

## 4. v0.2 — Decision Infra & Guardrail (Deterministic)

Starting from **v0.2**, Decision Assistant introduces a deterministic
**Decision Infra + Guardrail layer**.

This layer evaluates low-level signals and upgrades them into
explicit execution permissions.

> This section defines **system-level behavior**, not a single rule.

---

### 4.1 Signal: `files_touched`

`files_touched` is used as a proxy for **change amplification / refactor risk**.

It reflects how widely a single change spreads across the codebase.

---

### 4.2 Policy Evaluation (Infra)

The infra layer maps signals into **policy actions**:

| Condition (`files_touched`) | `policy.action` | Meaning |
|---:|---|---|
| `< 8` | `ALLOW` | No high-cost signals detected |
| `>= 8` and `< 16` | `WARN` | High change amplification; proceed with caution |
| `>= 16` | `BLOCK` | Hard stop: refactor risk exceeded threshold |

These thresholds are **defaults**, not user-tunable parameters in v0.2.

---

### 4.3 Suggested Exits (A-mapping)

Suggested exits provide **semantic guidance**, not commands.

#### When `policy.action = WARN`

- `TIMEBOX_10`
- `VALIDATE_FIRST`

#### When `policy.action = BLOCK`

Semantic exits:

- `REVERT_TO_STABLE`
- `SPIKE_BRANCH`
- `SPLIT_CHANGESET`

Current implementation mapping:

| Semantic Exit | Mapped Exit |
|---|---|
| `REVERT_TO_STABLE` | `STOP` |
| `SPIKE_BRANCH` | `TIMEBOX_10` |
| `SPLIT_CHANGESET` | `VALIDATE_FIRST` |

---

### 4.4 Guardrail Decision (Deterministic)

The Guardrail layer upgrades policy outcomes into **execution permissions**:

| `policy.action` | `guardrail.action` |
|---|---|
| `ALLOW` | `ALLOW` |
| `WARN` | `REQUIRE_CONFIRM` |
| `BLOCK` | `BLOCK` |

#### Rationale

- `ALLOW` permits execution
- `WARN` requires **explicit user confirmation**
- `BLOCK` enforces a hard stop until risk is reduced

Guardrail behavior is fully deterministic and does not involve LLM reasoning.

---

## 5. Adding a New Rule

When introducing a new rule:

1. Implement logic under `src/rules/`
2. Register the rule in the rule dispatcher
3. Add a section to this document covering:
   - Why the rule exists
   - What risk it addresses
   - How thresholds were chosen

Rules without documented rationale may be rejected.

---

## 6. Future Directions

Planned improvements include:

- Multi-rule aggregation
- Trend-based decision confidence
- Cross-rule conflict resolution

These capabilities will evolve based on real-world usage data
and stability requirements.
