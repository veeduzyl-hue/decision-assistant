# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-01-04

### Added
- Initial working MCP server
- Core decision flow: detect → assess → plan → followup
- First commercial rule: refactor time black hole
- Local decision memory (state.json, decision.md)
- Cursor MCP integration
- Documentation and examples

### Notes
- This is a working MVP.
- APIs, scoring, and rules are expected to evolve.


## v0.2.0 - 2026-01-08

### Added
- Guardrail Receipt Protocol (two-step confirmation for risky actions).
- Explicit `REQUIRE_CONFIRM` state with receipt-based confirmation.
- `confirm.mode = "EXECUTE"` to explicitly acknowledge and allow execution.
- Deterministic receipt fields: `receipt_id`, `plan_hash`, `scope`.
- Example flows (PASS 1 / PASS 2) documented in `docs/guardrail_protocol.md`.

### Added (Developer Experience)
- Local verification script: `verify:guardrail`.
- Smoke test enforcing Guardrail protocol invariants.
- `--auto` option for local testing of two-step confirmation flow.

### Behavior Changes
- Risky actions are no longer implicitly allowed.
- When risk exceeds guardrail threshold, execution is blocked until explicit confirmation is provided.
- Confirmation must match the latest computed execution plan (`plan_hash`).

### Documentation
- Added Guardrail Receipt Protocol (Public Contract + Implementer Notes).
- Documented default guardrail thresholds and confirmation semantics.

### Notes
- Default guardrail thresholds are fixed in v0.2.0 for consistency and reproducibility.
- Thresholds may become configurable in a future release without breaking the protocol.

## v0.2.1

### Added
- R3: ai_momentum_override promoted to active FULL-mode rule
- Latent rule aggregation into REQUIRE_CONFIRM decision path

### Behavior
- REQUIRE_CONFIRM may now be triggered by non-files_touched signals
- Receipt validation remains unchanged and backward-compatible

### No breaking changes
- v0.2.0 receipts remain valid
