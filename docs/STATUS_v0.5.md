# Decision Assistant v0.5 Status

## Current Status

Decision Assistant v0.5 is the contract-freeze release line.

v0.4 is treated as **structure-stable**.

v0.5 is the release line that upgrades the project into a **contract-stable developer infrastructure component**.

Current state:

> contract freeze implemented; release gate ready for full verification

---

## 1. Release Intent

v0.5 is not a feature-expansion release.

Its purpose is to freeze and validate the externally visible contracts that already exist in practice, and to stabilize package publishing and installation behavior.

v0.5 is focused on:

- assess tool contract freeze
- receipt schema freeze
- decision-log schema freeze
- error semantics freeze
- package publishing surface review
- install/use smoke validation
- migration / compatibility notes
- release gating for contract stability

---

## 2. Baseline Inherited from v0.4

The v0.5 line starts from the following already-established baseline:

- `docs/SCOPE_FREEZE_v1.0.md` exists
- `AGENTS.md` exists
- `docs/STATUS_v0.4.md` exists
- mainline structure is converged to:
  - `src/modules/assess`
  - `src/modules/risk`
  - `src/modules/policy`
  - `src/modules/receipt`
  - `src/runtime`
  - `src/audit`
  - `src/persistence`
  - `config/schema`
- legacy schemas have been removed
- `src/guardrail` and infra shim cleanup is complete
- build is passing
- machine-contract verification is passing
- guardrail verification is passing
- determinism verification is passing
- replay protection verification is passing
- receipt lifecycle verification is passing
- decision-log verification is passing

This baseline is treated as the starting point for contract freeze.

---

## 3. v0.5 Objective

The v0.5 objective is singular:

> convert the current structure-stable repository into a contract-stable developer infrastructure component

This is achieved by freezing the existing external contracts and verifying packaging/install/use stability.

---

## 4. Frozen or To-Be-Frozen Contracts

The following contracts are in scope for v0.5 freeze.

## 4.1 assess tool contract
Status: completed

Target:
- document request/response contract
- define required and optional fields
- verify deterministic behavior
- confirm replay-protection semantics

## 4.2 receipt schema
Status: completed

Target:
- define schema version
- freeze required fields and field types
- align schema and runtime output

## 4.3 decision-log schema
Status: completed

Target:
- define entry structure
- freeze append-only semantics
- align schema and runtime output

## 4.4 error semantics
Status: completed

Target:
- freeze error code set
- freeze exit-code semantics
- define machine-readable error payload expectations

## 4.5 package publishing surface
Status: completed

Target:
- review `package.json`
- define public vs non-public surface
- verify packed artifact contents
- verify executable/install path stability

## 4.6 install/use path
Status: completed

Target:
- verify clean install
- verify executable startup
- verify assess invocation
- verify receipt and decision-log production
- verify invalid-input error stability

---

## 5. Required v0.5 Documents

The following documents are required for v0.5 completion:

- `docs/CONTRACT_FREEZE_v0.5.md`
- `docs/PACKAGE_SURFACE_v0.5.md`
- `docs/MIGRATION_v0.4_to_v0.5.md`
- `docs/STATUS_v0.5.md`

Additional machine-readable contract artifacts may also be required, including:

- request schema
- response schema
- receipt schema
- decision-log entry schema

---

## 6. Required Verification Additions

The following verification areas are expected to be added or formalized in v0.5:

- package surface verification
- npm pack content verification
- install smoke test
- use smoke test
- error semantics verification

These sit alongside the already-passing verification baseline inherited from v0.4.

---

## 7. Exit Criteria

v0.5 is considered complete only when all of the following are true:

### Documentation
- contract freeze document is complete
- package surface document is complete
- migration note is complete
- status document is current
- README is aligned with actual stable usage

### Machine contracts
- assess request/response schema is defined where applicable
- receipt schema is defined
- decision-log schema is defined

### Verification
- build passes
- machine-contract verification passes
- guardrail verification passes
- determinism verification passes
- replay-protection verification passes
- receipt lifecycle verification passes
- decision-log verification passes
- error semantics verification passes
- package surface verification passes
- npm pack content verification passes
- install smoke test passes
- use smoke test passes

### Release discipline
- public and non-public surface are clearly separated
- documented usage is stable
- out-of-scope items remain out of mainline

---

## 8. Explicit Mainline Exclusions

The following remain explicitly outside the v0.5 mainline:

- responsibility semantics
- boundary semantics
- misuse_report semantics
- team approval semantics
- dashboard/reporting surfaces
- organization governance layers
- higher-level orchestration constructs

These are not deferred sub-items of v0.5. They are excluded from the release line.

---

## 9. Release Position

Current position:

- assess request schema exists
- assess response schema exists
- receipt schema exists
- decision-log entry schema exists
- error codes, payload shape, and fatal exit semantics are stabilized in code
- package surface verification exists
- npm pack content verification exists
- install smoke exists
- use smoke exists
- package version and default emitted engine/policy version are aligned to the same v0.5 release line

When the full release gate passes in one run, v0.5 can truthfully claim:

> Decision Assistant is contract-stable for documented usage as a developer infrastructure MCP component.

The remaining discipline step is to run the full release gate before tagging.

---

## 10. Next Required Actions

1. run the full release gate
2. review results against release notes
3. tag v0.5 only after all checks pass
