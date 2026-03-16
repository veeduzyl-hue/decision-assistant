# Configuration

Decision Assistant supports configurable thresholds and rules.

## Config location

Configuration is loaded from code defaults in v0.2.

## Machine Contracts

Mainline v1.0 machine contracts live under `config/schema/`:

- `policy-config.schema.json` defines the deterministic policy and guardrail configuration shape.
- `receipt.schema.json` defines the server-authoritative receipt record used for execution binding and replay checks.
- `decision-log.schema.json` defines one append-only decision log event record.

These schemas intentionally cover only the mainline action-gate model. They do not define `responsibility`, `boundary`, or `misuse_report` contracts.

## Guardrail Default Thresholds

In v0.2, guardrail thresholds use fixed defaults to ensure consistent
and reproducible behavior.

| Signal        | WARN | BLOCK |
|---------------|------|-------|
| files_touched | 8    | 16    |

These values are treated as **defaults**, not user-tunable parameters.

Future versions may allow customization without changing the Guardrail
Receipt Protocol.

## Rule Defaults (v0.2)

### ai_momentum_override

```
rules.ai_momentum_override = {
  enabled: true,
  thresholds: {
    files_touched_warn: 8,
    diff_lines_warn: 400
  }
}
```

These defaults are deterministic and used by the FULL-mode latent rule.
