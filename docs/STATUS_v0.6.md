# Decision Assistant v0.6 Status

## Current Status

Decision Assistant v0.6 is the persistence reliability hardening line.

v0.5.0 is treated as the contract-stable baseline.

Current state:

> persistence reliability hardening in progress

---

## Objective

Strengthen SQLite-backed persistence reliability for:

- receipt lifecycle authority
- replay protection
- append-only decision logs

without changing any frozen v0.5.0 public contract semantics.

---

## In Scope

- persistence initialization and migration safety
- store identity validation and schema-version guard
- rejection of unknown future schema versions
- rejection of partial or incompatible persistence layouts
- readonly/write-path persistence failure verification
- restart safety hardening
- concurrent/double-consume verification hardening
- append-only log integrity checks
- SQLite runtime pragma verification

---

## Out of Scope

- assess public contract changes
- receipt public schema meaning changes
- decision-log public schema meaning changes
- stable error-code meaning changes
- new contract families
- new workflow semantics

---

## Verification Additions

The v0.6 line should add:

- `scripts/verify_persistence_migration.mjs`
- `scripts/verify_persistence_recovery.mjs`
- `scripts/verify_concurrent_consume.mjs`
- `scripts/verify_decision_log_integrity.mjs`
- `scripts/verify_sqlite_pragmas.mjs`
- `scripts/verify_store_identity.mjs`
- `scripts/verify_schema_version_guard.mjs`
- `scripts/verify_partial_schema_reject.mjs`
- `scripts/verify_write_path_failure.mjs`
- `scripts/verify_corrupt_store_reject.mjs`

These are additive to the v0.5.0 release gate.
The v0.6 gate assumes sequential verification execution after a successful build so all checks reuse the same `dist` output.

Verification matrix:

- contract checks
  - `verify:machine-contracts`
  - `verify:guardrail`
  - `verify:determinism`
  - `verify:replay-protection`
  - `verify:receipt-lifecycle`
  - `verify:decision-logs`
  - `verify:error-semantics`
- gate hygiene / packaging checks
  - `verify:package-surface`
  - `verify:pack-contents`
  - `verify:install-smoke`
  - `verify:use-smoke`
- persistence reliability checks
  - `verify:persistence-migration`
  - `verify:persistence-recovery`
  - `verify:concurrent-consume`
  - `verify:decision-log-integrity`
  - `verify:sqlite-pragmas`
- recovery guard checks
  - `verify:store-identity`
  - `verify:schema-version-guard`
  - `verify:partial-schema-reject`
  - `verify:write-path-failure`
  - `verify:corrupt-store-reject`

Intentional separations:

- `verify:decision-logs` stays separate from `verify:decision-log-integrity`
  - the former checks emitted runtime event shape/sequence
  - the latter checks append-only database invariants
- `verify:persistence-recovery` stays separate from recovery-guard checks
  - it proves valid stores survive restart
  - the guard checks prove invalid stores are rejected early
- `scripts/verify_decision_logs.mjs` remains a legacy helper outside the main matrix; the TypeScript verifier is the maintained gate path

---

## Persistence Metadata Notes

- `application_id` identifies Decision Assistant-owned SQLite files during audit and recovery work. It is internal persistence metadata, not a public runtime contract field.
- `user_version` tracks the on-disk schema baseline used by migration logic.
- Bump `user_version` only when a persistence change requires schema migration for existing databases:
  - table shape changes
  - index changes
  - trigger changes
- Do not bump `user_version` for public-contract documentation updates or verifier-only changes that leave the on-disk schema untouched.

---

## Recovery Guard Notes

- Explicitly rejected store states now include:
  - wrong `application_id`
  - unknown future `user_version`
  - non-Decision Assistant SQLite files
  - partial critical persistence layouts
  - corrupt or non-SQLite files
- Explicitly supported legacy migration remains narrow:
  - existing Decision Assistant stores with the three critical tables present
  - missing `decision_logs.schema_version` column
  - missing current metadata fields (`application_id` / `user_version`) on otherwise valid legacy stores
- Critical persistence structures for mainline recovery checks are:
  - `receipts`
  - `replay_index`
  - `decision_logs`
  - append-only `decision_logs` triggers
