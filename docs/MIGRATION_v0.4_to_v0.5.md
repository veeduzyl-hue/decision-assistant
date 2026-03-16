# Decision Assistant Migration: v0.4 to v0.5

## Status

Draft migration note for the v0.5 stabilization release.

---

## 1. Purpose

This document explains the compatibility and migration posture from Decision Assistant v0.4 to v0.5.

v0.4 is treated as **structure-stable**.

v0.5 is the release that formalizes the repository as a **contract-stable developer infrastructure component**.

This is a stabilization migration, not a feature expansion migration.

---

## 2. Summary

### v0.4
- structure is stabilized
- major repository cleanup is complete
- mainline module layout is converged
- existing verification paths are passing

### v0.5
- external contracts are formally frozen
- packaging surface is reviewed and stabilized
- install/use path is explicitly documented and verified
- compatibility rules become explicit

---

## 3. Compatibility Statement

Decision Assistant v0.5 is intended to be a **non-breaking stabilization release** for documented usage established in v0.4.

### This means
If you are using the project through documented paths, v0.5 should not require conceptual re-adoption.

### This does not mean
Every internal path, script, or implementation detail from v0.4 is preserved as public API.

---

## 4. What Becomes Frozen in v0.5

The following become explicit stable contracts in v0.5:

1. assess tool contract
2. receipt schema
3. decision-log schema
4. error semantics
5. package publishing surface
6. minimum install/use path

From v0.5 onward, these are no longer allowed to drift informally.

---

## 5. Migration Impact by Usage Pattern

## 5.1 documented user of install/start/use path
Expected impact: minimal to none.

You should be able to continue using the package through its documented install and execution path, subject to the same core behavior now being explicitly frozen.

## 5.2 consumer of machine-readable receipt output
Expected impact: low.

Receipt semantics should become more stable, not less. Existing consumption should continue to work if it relied on the caller-visible runtime receipt binding fields that are now frozen in `config/schema/receipt.schema.json`.

The persisted SQLite receipt row remains an internal persistence contract and is not part of the public receipt schema guarantee.

## 5.3 consumer of decision logs
Expected impact: low.

Decision-log entries should remain compatible while becoming more formally constrained and documented.

## 5.4 consumer relying on internal imports
Expected impact: unsupported.

If you relied on internal repository paths, deep imports, or undocumented internal modules, v0.5 does not provide a compatibility guarantee for those usages.

---

## 6. No New Semantic Layer

v0.5 does not introduce:

- new decision semantics
- new policy layer semantics
- new governance abstractions
- new organizational workflow surfaces

If you are looking for new feature semantics, v0.5 is not that release.

---

## 7. Expected Repository Changes

The following categories of repository changes are expected in v0.5:

- new or clarified contract documents
- new or clarified schema files
- new packaging verification scripts
- new install/use smoke verification scripts
- README updates to align documentation with actual stable usage

The following categories of changes are not expected:

- new major modules for higher-level orchestration
- new contract families beyond the v0.5 freeze list
- semantic expansion of receipts or logs into broader workflow objects

---

## 8. Compatibility Policy Starting in v0.5

## 8.1 stable for documented usage
The following are treated as stable for documented usage:

- documented assess request/response shape
- documented receipt schema fields
- documented decision-log schema fields
- documented error codes and exit semantics
- documented install path
- documented executable/MCP startup path

## 8.2 not guaranteed
The following are not covered by compatibility guarantees:

- internal source layout
- undocumented helper scripts
- private build paths
- local-only verification flows
- any deep import not explicitly documented as public

---

## 9. Allowed Future Changes After v0.5

The following should remain allowed in future non-breaking releases:

- additive optional fields
- documentation clarifications
- internal refactors
- stronger verification coverage
- packaging hygiene improvements that do not break documented usage

---

## 10. Disallowed Future Changes Without Major Versioning

The following should require a major version if changed:

- assess request/response breaking changes
- receipt required-field changes
- decision-log required-field changes
- stable error-code renames
- stable exit-code semantic changes
- package rename
- executable rename
- documented startup path breakage

---

## 11. Suggested Upgrade Guidance

For maintainers and consumers upgrading from v0.4 to v0.5:

1. review the v0.5 contract freeze document
2. review the v0.5 package surface document
3. confirm your usage is through documented paths
4. stop relying on internal repository imports if any exist
5. validate your receipt/log consumer against the frozen schema definitions
6. run the v0.5 smoke and verification suite before adopting the release in automation

---

## 12. Migration Notes for Maintainers

Maintainers should treat v0.5 as the point where undocumented behavior stops being “implicitly flexible.”

Before tagging v0.5:

- ensure schemas match implementation
- ensure docs match implementation
- ensure verification covers all frozen contracts
- ensure internal-only areas are clearly marked as non-public
- ensure package-surface and smoke verifiers pass against the packed artifact
- ensure package version and default emitted engine/policy version stay aligned to the same release line

---

## 13. Mainline Exclusions Preserved Across Migration

The move from v0.4 to v0.5 does not add the following into mainline scope:

- responsibility fields
- boundary fields
- misuse_report fields
- team approval flows
- dashboard/reporting surfaces
- organization-level governance semantics
- higher-level orchestration contracts

These remain out of scope after the migration.

---

## 14. Final Migration Position

The migration from v0.4 to v0.5 should be understood as:

> structure stabilization becoming contract stabilization

If your usage is documented and externally aligned, v0.5 should feel like a hardening release.

If your usage depends on internal implementation details, v0.5 is the point where those assumptions should be removed.
