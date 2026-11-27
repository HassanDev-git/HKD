# Changelog

User-visible notes for HKD versions. Verification outcomes are limited to the evidence stated in each entry and the associated release manifest.

## 1.1.2 — release candidate (not published)

- Regenerates host artifact manifests from the current package version and rejects stale compiler/runtime version metadata during release verification.
- Makes Doctor describe container execution, package cache state, security scans, and fuzz corpus evidence accurately.
- Improves the VS Code extension with discoverable CLI process tasks, real build/check/format commands, snippets, configurable language-server activation, and visible startup errors.
- Release candidate only. See [release notes](docs/release-notes-1.1.2.md); cross-platform and packaging claims require successful CI evidence.

## 1.1.1 — 2026-11-26 (tagged publication requires successful release verification)

- Modernized release packaging and gated publication on six native-host package build and smoke-verification jobs.
- Added release-wide SHA-256 checksums and a provenance manifest for the exact source commit and runner toolchains.
- Carries forward compiler, Zig runtime, package security, benchmark validation, and CI hardening from Phases 10.3–10.8.
- Publication is gated on the six-platform tag-triggered workflow and successful package-manifest/checksum aggregation.

## 1.1.0 — 2026-09-04

- Added compiler and CLI support for the 1.1 language and standard-library feature set.
- Added a TypeScript reference VM and an optional Zig bytecode interpreter.
- Added bytecode bundle tooling, package management, language-server support, and debugger protocol support.
- Added documentation for the language, bytecode format, CLI, package manifests, platform limits, and security boundaries.
- Traits and async/await language support remain experimental. JIT dispatch, native-code AOT, and WASM/WASI compilation are unavailable.

## 1.0.0 — 2026-09-04

- Established the 1.0 language and bytecode baseline.
- Added the initial language specification, grammar, standard tooling, and package workflow.
- Added the TypeScript compiler/reference runtime and the Zig bytecode runtime.

For details, see the [1.1.0 release notes](docs/release-notes-1.1.0.md) and the [language documentation](docs/).
