# Decision Assistant v0.5 Contract Freeze

## Status

Draft for v0.5 implementation.

Decision Assistant v0.4 is treated as **structure-stable**.

Decision Assistant v0.5 is defined as the release that upgrades the repository into a **contract-stable developer infrastructure component**.

This document defines what must be frozen in v0.5 and what remains explicitly outside the mainline.

---

## 1. Goal

The goal of v0.5 is singular:

> Upgrade the current structure-stable repository into a contract-stable developer infrastructure component.

v0.5 only covers:

- contract freeze
- packaging stability

v0.5 does **not** introduce new product semantics, new governance layers, or new workflow surfaces.

---

## 2. Scope

v0.5 focuses on the following areas only:

1. assess tool contract freeze
2. receipt schema freeze
3. decision-log schema freeze
4. error semantics freeze
5. package publishing surface review
6. install/use smoke test
7. migration / compatibility notes
8. release checklist

---

## 3. Non-Goals

The following are explicitly out of scope for v0.5 and must not enter the mainline through this release:

- new product features
- new semantic layers
- higher-level orchestration
- dashboard surfaces
- organization-level governance
- team approval flows
- responsibility fields
- boundary fields
- misuse_report fields
- any new contract not required for the eight scope items above

v0.5 is a stabilization release, not an expansion release.

---

## 4. Freeze Principles

All v0.5 work must follow these principles:

### 4.1 Freeze behavior before extending behavior
If a behavior is already externally observable and relied upon, freeze it before changing anything around it.

### 4.2 Freeze documented contracts, not internal implementation details
Internal module layout may continue to evolve after v0.5 unless separately documented as public surface.

### 4.3 Additive-only rule for stable contracts
Once a v0.5 contract is frozen, future non-breaking changes may only be additive and optional.

### 4.4 Stable machine-readable outputs take priority
If there is any tension between human-readable convenience and machine-readable determinism, machine-readable stability wins.

### 4.5 No silent semantic drift
A field name, enum, or error code must not retain the same spelling while changing meaning.

---

## 5. Contracts to Freeze

## 5.1 assess tool contract

The assess tool is the primary external execution contract and must be frozen in v0.5.

### Must freeze
- tool identity
- request top-level shape
- request field names
- request field required/optional status
- response top-level shape
- response field names
- verdict representation
- receipt return contract
- deterministic behavior for equivalent input
- replay-protection observable behavior

### Allowed after freeze
- additive optional fields only
- non-breaking documentation clarification
- stricter internal validation only if it does not break documented valid input

### Not allowed after freeze
- renaming fields
- re-layering request/response shape
- replacing stable fields with free text
- changing verdict representation
- changing idempotency or replay semantics without major versioning

---

## 5.2 receipt schema

The public receipt schema is the caller-visible runtime receipt binding returned by the assessment flow.
It is not the persisted SQLite receipt row used internally by the persistence layer.

### Must freeze
- top-level required fields
- field types
- ID field semantics
- machine-readable layout

### Allowed after freeze
- additive optional fields
- additive metadata fields that do not alter interpretation of existing fields

### Not allowed after freeze
- changing required field names
- changing type of existing fields
- replacing structured sub-objects with free text
- converting a single-assessment receipt into a higher-level aggregate object
- treating the internal persisted receipt row as public receipt schema without explicit versioning

---

## 5.3 decision-log schema

The decision log is the append-only execution record and must be frozen as a schema contract.

### Must freeze
- per-entry top-level structure
- minimum required fields
- timestamp format
- entry identity rules
- linkage to assess / receipt / decision identifiers
- append-only semantics
- parseability of each entry in isolation

### Allowed after freeze
- additive optional metadata
- additive fields that do not invalidate old log readers

### Not allowed after freeze
- changing existing field names
- changing append-only semantics
- introducing a format that cannot be processed entry-by-entry
- making entry meaning depend on undocumented external state

---

## 5.4 error semantics

All externally visible errors must be frozen as stable machine contracts.

### Must freeze
- error code set
- error category semantics
- exit-code semantics
- machine-readable error payload shape
- replay rejection semantics
- schema validation failure semantics
- persistence failure semantics
- internal fallback error semantics

### Allowed after freeze
- clearer human-readable message text
- additive diagnostic metadata where safe

### Not allowed after freeze
- renaming stable error codes in minor/patch releases
- returning message-only errors without stable code
- changing exit-code meaning
- returning the same failure mode under multiple unstable codes

Current v0.5 implementation freezes:

- stable tool-level error payloads for invalid input, unknown tool, persistence failure, and internal fallback
- stable confirmation error codes for receipt/replay execution rejection
- fatal process exit `1` for internal failure and `2` for persistence failure

---

## 5.5 package publishing surface

The published package surface must be frozen for v0.5.

### Must freeze
- package name
- executable entrypoint
- public bin name
- exports policy
- supported Node.js runtime range
- packaged file allowlist policy
- non-public internal module policy

### Allowed after freeze
- additive docs
- additive non-public internal files
- additive optional metadata in package manifest

### Not allowed after freeze
- accidental exposure of internal modules as public API
- undocumented deep-import reliance
- unstable packaging contents across equivalent builds

---

## 6. Freeze Conditions

A contract is considered frozen only when all of the following are true:

1. it is documented under `docs/`
2. it has a machine-readable schema where applicable
3. it has at least one verification path
4. it has explicit compatibility guidance
5. its non-goals and non-public areas are documented

If any of the above is missing, the contract is not yet frozen.

---

## 7. Package Surface Review Requirements

v0.5 must review and confirm the package publishing surface across the following areas:

### 7.1 package identity
- package name is final for v0.5
- versioning follows semver
- package metadata is internally consistent

### 7.2 executable surface
- published executable name is stable
- executable entrypoint resolves correctly after pack/install
- startup path works in clean environments

### 7.3 exports policy
- only intended public surface is exported
- internal modules are not implicitly treated as public API
- deep imports are not documented or relied upon

### 7.4 package contents
The packed artifact must include only what is needed for use and verification, such as:

- built runtime artifacts
- schemas
- license
- readme
- required config assets

The packed artifact must not include accidental content such as:

- temporary logs
- local cache files
- unused verification outputs
- removed legacy schemas
- editor/system junk

---

## 8. Install / Use Smoke Test Requirements

v0.5 must define the minimum reproducible consumer path and verify it in a clean environment.

### 8.1 install smoke
A clean environment must be able to:
- install the packed artifact
- resolve dependencies
- execute the package entrypoint
- return a successful basic startup path

### 8.2 startup smoke
A clean environment must be able to:
- start the MCP server
- avoid protocol-breaking stdout noise
- shut down cleanly

### 8.3 assess smoke
A clean environment must be able to:
- invoke assess with valid minimal input
- receive a valid response
- produce a valid receipt
- append a valid decision-log entry

### 8.4 stability smoke
A clean environment must verify:
- deterministic result for equivalent input
- replay protection behavior
- receipt lifecycle stability
- decision-log append behavior
- stable error semantics for invalid input

---

## 9. Compatibility Policy

v0.5 is intended to be a **non-breaking stabilization release** for documented usage.

### Compatible usage includes
- documented install path
- documented executable / MCP startup path
- documented assess invocation shape
- documented receipt consumption
- documented decision-log consumption

### Not covered by compatibility guarantees
- internal source imports
- undocumented scripts
- private file layout assumptions
- historical intermediate artifacts
- ad hoc local development paths

---

## 10. Mainline Exclusions

The following remain outside the mainline after v0.5 and must not be smuggled in through “small follow-up additions”:

- responsibility semantics
- boundary semantics
- misuse_report semantics
- team approval mechanisms
- dashboard/reporting surfaces
- organization-level policy layers
- higher-level orchestration abstractions

These are not deferred implementation details for v0.5. They are explicitly out of scope.

---

## 11. Required Deliverables for v0.5

v0.5 is not complete until the repository includes at least:

- `docs/CONTRACT_FREEZE_v0.5.md`
- `docs/PACKAGE_SURFACE_v0.5.md`
- `docs/MIGRATION_v0.4_to_v0.5.md`
- `docs/STATUS_v0.5.md`

And where applicable:

- request/response schema definitions
- receipt schema definition
- decision-log entry schema definition
- package surface verification script
- pack content verification script
- install smoke verification script
- use smoke verification script

---

## 12. Release Gate

v0.5 may be tagged only when all of the following are true:

- build passes
- machine-contract verification passes
- guardrail verification passes
- determinism verification passes
- replay-protection verification passes
- receipt lifecycle verification passes
- decision-log verification passes
- package surface verification passes
- npm pack content verification passes
- install smoke test passes
- use smoke test passes
- docs and schemas are aligned

If any release gate fails, v0.5 is not contract-stable.

---

## 13. Exit Criteria

Decision Assistant v0.5 is complete when the project can truthfully state:

> The assess tool contract, receipt schema, decision-log schema, error semantics, package publishing surface, and minimum install/use path are frozen, documented, validated, and treated as stable public contracts for documented usage.

Until then, v0.5 remains in progress.
