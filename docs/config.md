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

## Rule Defaults (Deterministic)

### R3: AI Momentum Override

These thresholds are fixed defaults in v0.2.

**weak_intent**

- intent length < 20, **OR**
- generic intent patterns (refactor / cleanup / optimize / improve / quick fix)
  without file/module tokens

**amplification_high**

| Signal | Threshold |
|---|---:|
| files_touched | >= 8 |
| diff_lines_total | >= 400 |
| new_files | >= 6 |

**boundary_cross**

- touches_package_json = true, **OR**
- touches_lockfile = true, **OR**
- touched_paths includes `infra/`, `docker/`, or `terraform/`

**recommended boundary**

| Field | Default |
|---|---|
| timebox_minutes | 20 |
| max_files | 2 |
| forbid_new_deps | true |
| forbid_protected_paths | false |
