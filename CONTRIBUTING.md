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

## Adding a new decision rule

1. Add rule logic under `src/rules/`
2. Register it in the rule dispatcher (or rule index)
3. Provide a short explanation and threshold rationale in docs or code comments

## Commit message convention

We use **Conventional Commits**:

- `feat:` new features
- `fix:` bug fixes
- `docs:` documentation only changes
- `refactor:` code restructuring without behavior change
- `chore:` tooling, cleanup, non-product code

## Pull Requests

- Keep PRs focused
- Describe the decision logic change clearly
- Explain **why**, not just what
Any change that breaks receipt_semantics.test.ts MUST be justified as a semantic-breaking change