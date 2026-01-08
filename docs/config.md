# Configuration

Decision Assistant supports configurable thresholds and rules.

## Config location

Configuration is loaded from code defaults in v0.2.

## Guardrail Default Thresholds

In v0.2, guardrail thresholds use fixed defaults to ensure consistent
and reproducible behavior.

| Signal        | WARN | BLOCK |
|---------------|------|-------|
| files_touched | 8    | 16    |

These values are treated as **defaults**, not user-tunable parameters.

Future versions may allow customization without changing the Guardrail
Receipt Protocol.
