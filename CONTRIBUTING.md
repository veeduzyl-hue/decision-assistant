# Contributing to Decision Assistant

Thank you for your interest in contributing!

## How to contribute
- Report bugs via GitHub Issues
- Propose ideas or rules via Feature Requests
- Submit Pull Requests for fixes or improvements

## Development setup

```bash
npm install
npm run build
```

## Mainline direction

Decision Assistant v1.0 is a deterministic MCP-based execution control component.

Mainline work should strengthen one or more of these properties:

- deterministic assessment
- receipt-gated execution
- replay protection
- append-only decision logs
- restart safety
- atomic receipt consume

Prefer infrastructure hardening over feature expansion.

## Repository structure

Current mainline code is organized around:

- `src/modules/assess`
- `src/modules/risk`
- `src/modules/policy`
- `src/modules/receipt`
- `src/runtime`
- `src/audit`
- `src/persistence`
- `config/schema`

Prefer changes in those areas when working on adjacent code.

## Scope constraints

Do not expand the mainline beyond the frozen v1.0 boundary.

Do not add required runtime objects or semantics for:

- `responsibility`
- `boundary`
- `misuse_report`

Do not introduce team workflow, governance platform, or dashboard semantics in mainline contributions.

## Shared changes

If you change core behavior, keep implementation, docs, tests, and machine contracts aligned in the same change.

Update the relevant materials together when applicable:

- docs such as `docs/SCOPE_FREEZE_v1.0.md`, `docs/receipt_semantics.md`, and runtime-facing protocol docs
- validation scripts and tests
- schemas under `config/schema/`

## Validation

Run the smallest relevant checks first. For core runtime or contract changes, prefer the repository hardening gates:

- `npm run build`
- `npm run verify:machine-contracts`
- `npm run verify:guardrail`

## Commit message convention

We use **Conventional Commits**:

- `feat:` new features
- `fix:` bug fixes
- `docs:` documentation only changes
- `refactor:` code restructuring without behavior change
- `chore:` tooling, cleanup, non-product code

## Pull Requests

- Keep PRs focused
- Describe the runtime or contract change clearly
- Explain **why**, not just what
- Do not mix refactors with unrelated behavior changes
- Any change to schemas, interfaces, or error semantics should update the related docs and validation in the same PR
