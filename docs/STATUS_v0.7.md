# Decision Assistant v0.7 Status

## Current Status

Decision Assistant v0.7 is the schema/versioning discipline hardening line.

v0.5.0 remains the frozen public-contract baseline.

v0.6.0 remains the persistence reliability and recovery baseline.

Current state:

> phase 3 closure: version/schema discipline is wired into the maintained release path

---

## Phase 1 Rules

The first v0.7 phase only hardens discipline around already version-bearing surfaces.

Maintained version-bearing surfaces:

- `package.json` `version`
- `src/config/defaults.ts` `defaultConfig.app.version`
- `src/server.ts` emitted MCP server version and emitted `policy_version` / `engine_version`
- `config/schema/policy-config.schema.json` root `schema_version`
- `config/schema/decision-log.schema.json` root `schema_version`
- `config/schema/decision-log-entry.schema.json` root `schema_version`
- `src/persistence/sqlite_store.ts` `SQLITE_SCHEMA_USER_VERSION`

Surfaces intentionally not expanded in phase 1:

- `assess.request.schema.json`
- `assess.response.schema.json`
- `receipt.schema.json`
- `src/runtime/error_semantics.ts` `ERROR_PAYLOAD_VERSION`
- `src/persistence/model.ts` / `src/persistence/state.ts` legacy internal state `version`

Those files already carry `v1` titles, but they do not currently expose a root `schema_version` field and phase 1 does not add one.
The two internal version-like surfaces above are not part of the phase 1 enforcement set because they are not the maintained package/runtime/schema/persistence version line for the main release path.

---

## Drift To Detect

- package version drifting from default emitted runtime version
- emitted runtime versions drifting away from `config.app.version`
- root schema version constants drifting inside existing version-bearing schemas
- duplicate decision-log schema files drifting apart
- persistence on-disk layout changing without corresponding `user_version` discipline

---

## Phase 1 Non-Goals

- no new schema families
- no public contract redesign
- no runtime behavior expansion
- no rule that every DB-related edit must bump `user_version`

Only migration-relevant on-disk layout changes should require persistence version discipline updates.

---

## Phase 2 Alignment Result

- No real drift was found across the phase 1 enforced surfaces.
- No source-of-truth changes were required for:
  - `package.json` version
  - `defaultConfig.app.version`
  - emitted MCP / `policy_version` / `engine_version` sourcing
  - maintained schema root `schema_version` constants
  - SQLite `user_version` discipline
- Phase 2 therefore remains a verification-backed confirmation pass rather than a redesign or broad cleanup pass.

---

## Phase 3 Closure Rules

Maintained release-path enforcement now includes `verify:matrix:versioning` as part of `release:gate:postbuild`.

Enforced in v0.7:

- `package.json` `version`
- `src/config/defaults.ts` `defaultConfig.app.version`
- `src/server.ts` emitted MCP server version
- `src/server.ts` emitted `policy_version` / `engine_version`
- `config/schema/policy-config.schema.json` root `schema_version`
- `config/schema/decision-log.schema.json` root `schema_version`
- `config/schema/decision-log-entry.schema.json` root `schema_version`
- `src/persistence/sqlite_store.ts` `SQLITE_SCHEMA_USER_VERSION`

Intentionally not enforced in v0.7:

- `config/schema/assess.request.schema.json`
- `config/schema/assess.response.schema.json`
- `config/schema/receipt.schema.json`
- `src/runtime/error_semantics.ts` `ERROR_PAYLOAD_VERSION`
- `src/persistence/model.ts` / `src/persistence/state.ts` legacy internal state `version`

Version-discipline updates are required when:

- package/runtime emitted version sources drift
- an enforced root `schema_version` constant changes
- migration-relevant on-disk SQLite layout changes

Version-discipline updates are not required for:

- doc-only wording changes
- verifier-only changes with no version-bearing artifact change
- internal refactors that preserve emitted versions, enforced schema constants, and on-disk layout
