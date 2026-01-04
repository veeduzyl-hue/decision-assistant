# Decision Assistant

> A Cursor MCP plugin that helps developers avoid refactor time black holes.

**Stop refactoring before it turns into a time black hole.**

Decision Assistant is an AI-native **decision engine** embedded directly into your editor via MCP (Model Context Protocol).  
It helps developers decide **when to stop refactoring, when to ship, and what to do next** — before productivity silently collapses.

---

## What problem does this solve?

If you’ve ever experienced this:

- You’ve been refactoring for days  
- No user-visible features shipped  
- Commits look “clean”, but progress feels stuck  
- You keep thinking: *“Just one more refactor…”*

You’ve entered a **Refactor Time Black Hole**.

Decision Assistant exists to **interrupt that moment with an explicit judgment**.

---

## What is Decision Assistant?

Decision Assistant is **not a chatbot**.

It is a **decision engine** designed to be embedded into your development workflow.

It:

- Detects risky refactoring patterns
- Quantifies decision risk with transparent scoring
- Applies explicit engineering rules
- Overrides overly optimistic decisions when necessary
- Outputs **concrete next actions**, not vague advice

All decisions are made **locally**, inside your editor.

---

## How it works (Conceptually)

Signals (Git / behavior)
↓
Rules (e.g. Refactor Time Black Hole)
↓
Risk Scoring (0–100)
↓
Decision (SHIP / SCOPED_REFACTOR / HARD_REFACTOR)
↓
Next Actions + Follow-up Questions


No hallucination.  
No hidden reasoning.  
Just explicit engineering judgment.

---

## Why is this different from other AI tools?

| Typical AI coding tools | Decision Assistant |
|---|---|
| Chat-based | Decision-based |
| Reactive | Proactive |
| Suggests code | Judges direction |
| Stateless | Decision memory |
| Optimistic by default | Rule-constrained |

Decision Assistant is designed to **disagree with you when needed**.

---

## Core Capabilities (v0.1)

### 1. Refactor Time Black Hole Detection
Detects when refactoring becomes counterproductive using signals like:
- Days without shipping
- Refactor commit ratio
- TODO / FIXME growth
- Code churn

### 2. Transparent Risk Scoring
Produces a risk score with clear breakdown:
- Time sink risk
- Change amplification
- Rework probability
- Structural & complexity smells
- User-provided context adjustments

### 3. Decision Override Logic
If a hard rule is hit, the system will **override optimistic decisions**.

Example:
Rule hit + SHIP → SCOPED_REFACTOR

### 4. Actionable Output
Every assessment returns:
- A clear decision
- Concrete next actions
- Minimal follow-up questions

---

## Example Output

```json
{
  "rule_hit": { "hit": true },
  "risk": { "score": 38 },
  "decision": "SCOPED_REFACTOR",
  "plan": [
    "Define a 2–4 hour shippable slice",
    "Set explicit refactor exit criteria"
  ],
  "followup": [
    "What was your last user-visible delivery?"
  ]
}
Installation (Cursor MCP Plugin)
1. Clone and build
git clone https://github.com/yourname/decision-assistant
cd decision-assistant
npm install
npm run build
2. Register MCP server in Cursor

Create or edit:
.cursor/mcp.json
{
  "mcpServers": {
    "decision-assistant": {
      "command": "node",
      "args": ["dist/server.js"],
      "cwd": "/path/to/decision-assistant"
    }
  }
}
Restart Cursor and enable the MCP server.
Usage

Decision Assistant exposes four MCP tools:

detect_triggers

assess

plan

followup

They can be invoked:

Manually via Cursor

Via scripts (e.g. handshake_full.mjs)

Automatically (future)

Decision Memory

All decisions are stored locally:

.decision_assistant/
  ├── state.json
  └── decision.md


This enables:

Decision history

Refactor cooldown logic

Long-term self-awareness of engineering habits

Philosophy

Decision Assistant is allowed to say:

“Not enough signal”

“You should stop”

“No action recommended”

This is not a failure.
This is the product working as intended.

Good engineering decisions are not about being smart.
They are about knowing when to stop.

Who is this for?

Indie developers

Startup engineers

Tech leads

Anyone who has ever thought:
“I think this refactor is necessary… but I’m not sure anymore.”

Roadmap

v0.2: Multi-rule engine & trend analysis

v0.3: Automatic signal extraction from git

v1.0: Team-level decision consistency

Status

🟢 v0.1 working

🟡 API & scoring evolving

🔵 Open for early adopters

License

MIT (for now)