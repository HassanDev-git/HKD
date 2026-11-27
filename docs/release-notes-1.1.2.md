# HKD 1.1.2 Release Candidate Notes

HKD 1.1.2 is being prepared as a release candidate. It has not been tagged or published. These notes describe intended source changes and do not imply that platform packages or Marketplace publication have succeeded.

## Changes under verification

- Release verification now checks that the artifact manifest's package, compiler, and runtime versions match `package.json`.
- Host packaging creates a fresh manifest from the current package version, preventing stale local inventories from being carried into a new candidate.
- Doctor distinguishes configured-but-uninitialized cache state from verified cache operation, and no longer claims container non-root execution or security scans were performed when they were not.
- The VS Code extension starts the HKD CLI language server with visible error reporting, supports its LSP enable setting, exposes Run, Build, Check, Format, Restart, Install, and Environment commands, and includes starter snippets.

## Verification status

See the candidate CI run and attached platform evidence before making any distribution or compatibility claim. The v1.1.1 release and its assets remain unchanged.