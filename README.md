Early adopters welcome. Feedback drives v0.2.
# Decision Assistant

A Cursor MCP plugin that helps developers avoid **refactor time black holes**  
by intervening at **decision time**, not code time.

Decision Assistant does not refactor your code.  
It helps you decide **whether you should refactor at all**.

---

## Example

Before you start refactoring, the assistant may produce:

```json
{
  "risk_score": 38,
  "decision": "SCOPED_REFACTOR",
  "plan": [
    "Define a 2–4 hour shippable slice",
    "Set explicit refactor exit criteria"
  ]
}
```

This happens when the assistant detects a pattern that often leads to  
over-investment, scope creep, or delayed delivery.

---

## What it does

Decision Assistant operates as a decision layer inside Cursor:

- Detects refactor risk signals  
- Assesses likelihood of wasted effort  
- Suggests scoped, shippable next steps  
- Encourages conscious stopping when signal is insufficient  

It is designed to surface uncertainty, not hide it.

---

## Installation

```bash
git clone https://github.com/veeduzyl-hue/decision-assistant
cd decision-assistant
npm install
npm run build
```

Register the MCP server in Cursor via `.cursor/mcp.json`.

Example `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "decision-assistant": {
      "command": "node",
      "args": ["dist/server.js"],
      "cwd": "/path/to/decision-assistant"
    }
  }
}
```

Restart Cursor and enable the MCP server.

---

## Usage

Decision Assistant exposes four MCP tools:

- `detect_triggers`
- `assess`
- `plan`
- `followup`

You can invoke them:

- Manually via Cursor
- Via scripts (e.g. `handshake_full.mjs`)
- Automatically (future)

---

## Decision Memory

All decisions are stored locally:

```
.decision_assistant/
  ├── state.json
  └── decision.md
```

This enables:

- Decision history
- Refactor cooldown logic
- Long-term self-awareness of engineering habits

---

## Philosophy

Decision Assistant is allowed to say:

- “Not enough signal”
- “You should stop”
- “No action recommended”

This is not a failure.  
This is the product working as intended.

Good engineering decisions are not about being smart.  
They are about knowing when to stop.

---

## Who is this for?

- Indie developers
- Startup engineers
- Tech leads

Anyone who has ever thought:

> “I think this refactor is necessary… but I’m not sure anymore.”

---

## Status

- 🟢 v0.1 — Working MVP
- 🟡 Rules and scoring are evolving
- 🔵 Open for early adopters and feedback

---

## Roadmap (high level)

- v0.2: Productization & early adoption
- v0.3+: Exploratory

The roadmap reflects direction, not promises.

---

## License

MIT

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to propose new decision rules.
