# HKD 1.1.1 Release Notes

HKD is a statically typed programming language with a TypeScript compiler and reference VM, an optional Zig bytecode interpreter, and an integrated CLI. HKD 1.1.1 is a patch release focused on release integrity, supported-host execution, and distribution consistency. The accompanying `release-manifest.json` records the exact source commit and native build evidence.

## Highlights

- Adds native-runner release packaging and smoke verification for Windows x64/ARM64, Linux x64/ARM64, and macOS x64/ARM64.
- Adds per-package source, runner, toolchain, size, and SHA-256 provenance plus release-wide checksums.
- Updates release automation to verify every platform package before publication.
- Rejects archive extraction paths that escape the destination or target symbolic links, and validates every benchmark raw sample before comparison.
- Exercises the Linux x64 container build and runtime, including non-root execution and invalid-program diagnostics, in CI.
- Includes the Phase 10.3–10.8 compiler/runtime, security, benchmark, CI, and cross-platform hardening already present in the source history.

## Compatibility and boundaries

- The standalone archives bundle Node.js for the packaged CLI. Building HKD from source requires Node.js 18 or later; the release packaging CI uses Node.js 24.
- The Zig runtime interprets HKD bytecode. JIT dispatch, native-code AOT, and WebAssembly/WASI compilation are unavailable.
- Hosted-runner results describe only the exact runner images and workflow revision recorded in the manifest; they do not certify every OS distribution or environment.
- The Jest sources and fixtures are retained in a private maintainer archive and are not part of the public checkout; this release workflow does not claim that suite passed.

The Windows, Linux, and macOS packages are available for x64 and ARM64. The standalone executable includes Node.js; running it does not require a separate Node installation. Building HKD from source requires Node.js 18 or later. The optional Zig runtime is a bytecode interpreter, not a JIT or native-code compiler.

See [platform support](platform-support.md), [known limitations](known-limitations.md), and the repository's [CI workflow](../.github/workflows/ci.yml) for scope details.
