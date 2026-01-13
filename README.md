If it feels annoying, it’s probably working.

# Decision Assistant

**Decision Assistant is a cold decision guard for developers.**

It does not help you code faster.  
It helps you **stop at the exact moment you are about to make a costly mistake**.

---

## What It Does

Decision Assistant intervenes **at decision time**, not code time.

It detects high-risk engineering behavior and forces an explicit choice when:

- Change amplification spikes  
- AI-generated code momentum gets out of control  
- Your actions drift away from your stated goal  
- A refactor is quietly turning into a time sink  

When triggered, it **interrupts execution** and requires explicit confirmation to proceed.

No silent continuation.  
No “just this once.”

---

## What It Is Not

This tool is intentionally limited.

It does **not**:

- Optimize or refactor your code  
- Explain risk scores or metrics  
- Provide dashboards or analytics  
- Act as a friendly coding assistant  
- Let you tweak thresholds to feel better  

If you want advice, suggestions, or encouragement — this is not the tool.

---

## How It Works (Phase 1)

- Deterministic rules only  
- No LLMs in the decision path  
- Cold-first, single-hit execution  
- Hard guardrail semantics:
  - `ALLOW`
  - `REQUIRE_CONFIRM`
  - `BLOCK`

If the system interrupts you, it is by design.

**Discipline is the product.**

---

## Observability (Local-only)

Decision Assistant includes **minimal, local-only observability**.

Every guardrail interruption is recorded so you can later answer questions like:

- How often do guardrails trigger?
- Which rules fire the most?
- How often do you actually proceed after being stopped?

### Data storage

- **No external upload**
- **No user identity**
- **Append-only local log**

**File path**
- Windows: `%USERPROFILE%\.decision-assistant\telemetry.jsonl`
- macOS / Linux: `~/.decision-assistant/telemetry.jsonl`

### Disable telemetry

```bash
DA_TELEMETRY=0
```

### Generate a report

```bash
npx tsx scripts/telemetry_report.ts --days 7
```

The report shows:
- Number of interruptions
- Pending vs confirmed executions
- Execution rate (`confirmed / pending`)
- Most frequent rules triggered

Telemetry exists to **measure discipline**, not to optimize comfort.

---

## Who This Is For

- Independent developers  
- Builders using AI copilots  
- People who repeatedly lose weeks to “just one more refactor”  
- Anyone who wants a system that can say **“stop”** when they won’t  

If you are optimizing for comfort, this tool will feel annoying.

That is intentional.

---

## Status

- Phase 1: Cold Rules Guardrail ✅  
- Phase 2: Latent risk analysis (internal, not exposed)  
- Phase 3+: Undecided  

The roadmap is deliberately constrained.

---

## Philosophy

Most developer tools help you move faster.

Decision Assistant helps you **not move when you shouldn’t**.

That difference matters more than it sounds.

> If you are afraid this tool might interrupt you too often,  
> then you are probably the exact person it was built for.
