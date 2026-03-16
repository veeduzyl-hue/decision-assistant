# Decision Assistant v0.5 Package Surface

## Status

Draft for v0.5 package stabilization.

This document defines the package publishing surface that is considered stable in v0.5.

Its purpose is to prevent accidental public API drift and packaging inconsistency.

---

## 1. Goal

The goal of package surface review in v0.5 is to ensure that Decision Assistant can be treated as a stable developer infrastructure package with:

- predictable installation
- predictable executable startup
- predictable public package surface
- predictable packed artifact contents

This document describes what is public, what is not public, and what must be verified before release.

---

## 2. Public Surface

The following are considered the intended public package surface for v0.5.

## 2.1 package identity
The package identity defined in `package.json` is part of the stable release surface.

This includes:

- `name`
- `version`
- `type`
- `engines`
- `license`

## 2.2 executable surface
The published executable entrypoint is part of the stable public surface.

This includes:

- the `bin` command name
- the runtime entrypoint it resolves to
- its ability to start successfully after installation

## 2.3 documented install path
The documented package installation path is part of the stable public surface.

This includes:

- package installation from packed artifact
- package installation from registry when published
- documented invocation commands
- documented basic startup path

## 2.4 documented MCP startup path
The documented way to start the MCP server is part of the stable public surface.

This includes:

- command name
- startup arguments if documented
- startup expectations described in the README or release docs

---

## 3. Non-Public Surface

The following are **not** part of the public API in v0.5 unless explicitly documented otherwise.

## 3.1 internal source layout
The following must be treated as internal implementation detail:

- `src/modules/*`
- `src/runtime/*`
- `src/audit/*`
- `src/persistence/*`

Their structure may evolve after v0.5 without constituting a breaking public API change.

## 3.2 undocumented deep imports
Any import path that reaches into internal files or compiled output paths is non-public.

Examples of non-public usage include:

- deep imports into internal build output
- direct imports from undocumented internal module paths
- file-path assumptions based on local repository layout

These usage patterns are not covered by compatibility guarantees.

## 3.3 local verification scripts
Repository-local verification scripts are not public runtime API unless explicitly documented as supported consumer tooling.

---

## 4. Exports Policy

v0.5 must explicitly define and verify package exports policy.

### Policy
- only intended public package entrypoints may be exported
- no accidental export of internal implementation modules
- no reliance on implicit Node resolution for internal paths
- exports must align with documented usage

### Rule
If an import path is not explicitly documented as public, it is not public.

---

## 5. Package Manifest Review

The following `package.json` fields must be reviewed and treated as part of package-surface stability.

## 5.1 identity fields
- `name`
- `version`
- `license`

## 5.2 runtime fields
- `type`
- `main` if present
- `exports` if present
- `bin`
- `engines`

## 5.3 publication fields
- `files`
- `repository`
- `homepage` if present
- `bugs` if present

## 5.4 script fields
Scripts are primarily repository maintenance surface, not consumer API. However, release-critical scripts must remain coherent with the published package behavior.

---

## 6. Packed Artifact Policy

The packed artifact generated for v0.5 must be stable and reviewable.

## 6.1 required contents
The package tarball should contain only files required for installation, execution, and declared runtime contract support, such as:

- built runtime output
- package manifest
- license
- readme
- required config/schema assets
- any runtime-required static assets

## 6.2 forbidden contents
The package tarball must not contain accidental or non-runtime noise, including:

- local logs
- cache files
- editor metadata
- temporary artifacts
- removed legacy schemas
- experimental scratch files
- unrelated repo outputs
- test snapshots unless intentionally published

## 6.3 deterministic intent
Equivalent source state should produce equivalent package intent.

The exact tarball hash may vary depending on tooling and metadata, but the included file set and public surface must not drift unexpectedly.

---

## 7. Node Runtime Policy

The supported Node.js range declared for v0.5 must be explicit and verified.

### Requirements
- documented in `package.json`
- aligned with actual runtime/build behavior
- reflected in install/use smoke testing

Current verified release-gate floor: Node.js 24+.

A release is not considered package-stable if the declared runtime range and actual runtime behavior diverge.

---

## 8. Installability Policy

The package must be installable in a clean environment without relying on repository-local assumptions.

### Minimum requirements
A clean environment must be able to:

1. install the package tarball
2. resolve dependencies
3. invoke the published executable
4. execute the documented basic startup path
5. start the documented server entrypoint

---

## 9. Useability Policy

The package must be usable through its documented external path after installation.

### Minimum requirements
A clean environment must be able to:

1. start the MCP server
2. call assess through the documented path
3. receive a valid response
4. produce a valid receipt
5. produce a valid decision-log entry

---

## 10. Verification Requirements

v0.5 should include verification for the following areas.

## 10.1 package surface verification
A verification step should confirm:

- required manifest fields exist
- executable entrypoint resolves
- exports policy is coherent
- non-public surface is not accidentally exposed

## 10.2 npm pack content verification
A verification step should confirm:

- expected files are included
- forbidden files are excluded
- package contents align with policy

## 10.3 install smoke verification
A verification step should confirm:

- tarball can be installed in a clean temp directory
- executable is callable
- basic runtime path works

## 10.4 use smoke verification
A verification step should confirm:

- server can start
- assess can be invoked
- receipt and decision log are produced
- invalid input yields stable error semantics

---

## 11. Documentation Alignment Rule

The package surface is not considered frozen unless the following are aligned:

- `package.json`
- README install and usage examples
- release notes for v0.5
- this document
- verification scripts

If documentation and implementation disagree, the package surface is not yet stable.

---

## 12. Change Policy After v0.5

After v0.5:

### Allowed in patch/minor releases
- internal refactors
- docs improvements
- additive optional metadata
- non-breaking verification hardening

### Not allowed without major release
- executable rename
- package rename
- exports restructuring that breaks documented usage
- deep-import breakage only if those imports were explicitly documented as public
- runtime requirement changes that invalidate documented supported environments

---

## 13. Release Gate

Package surface is considered stable only if all of the following are true:

- package manifest review is complete
- public vs non-public boundaries are documented
- `npm pack` output is reviewed
- clean install succeeds
- executable startup succeeds
- documented use path succeeds
- README matches actual behavior

If any one of these fails, package surface freeze is incomplete.
