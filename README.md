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

## Try It Locally (5 minutes)

This repository includes a minimal round-trip demo that shows the full guardrail lifecycle:
**REQUIRE_CONFIRM → explicit EXECUTE → ALLOW**, plus local-only observability.

### 1. Install dependencies

```bash
npm install
npm run build
```

### 2. Run the guardrail round-trip demo

```bash
npx tsx examples/demo_guardrail_roundtrip.ts
```

You will see:

- A triggered `REQUIRE_CONFIRM`
- A receipt (`receipt_id`, `plan_hash`)
- A second execution with `mode=EXECUTE`
- A final `ALLOW`

### 3. Inspect local-only telemetry

```bash
npx tsx scripts/telemetry_report.ts --days 7
```

Telemetry is:

- Local-only (JSONL file)
- Append-only
- Anonymous
- Opt-out via `DA_TELEMETRY=0`

Stored at:

```
~/.decision-assistant/telemetry.jsonl
```

---

## Who This Is For

- Independent developers  
- Builders using AI copilots  
- People who repeatedly lose weeks to “just one more refactor”  
- Anyone who wants a system that can say **“stop”** when they won’t  

If you are optimizing for comfort, this tool will feel annoying.

---

## Status

- Phase 1: Cold Rules Guardrail ✅  
- Phase 2: Latent risk analysis (internal, not exposed)  
- Phase 3+: Not decided yet  

This project is opinionated on purpose.

---

## Philosophy

Most developer tools help you move faster.

Decision Assistant helps you **not move when you shouldn’t**.

That difference matters more than it sounds.

> If you are afraid this tool might interrupt you too often,  
> then you are probably the exact person it was built for.
