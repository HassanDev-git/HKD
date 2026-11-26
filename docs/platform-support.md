# HKD Platform Support and Validation

**Current version:** 1.1.0
**Last local audit:** 2026-10-24

## Verified in this checkout

| Host target | Evidence | Status |
|---|---|---|
| Windows x64 | TypeScript checks, all 120 Jest suites / 1,046 tests, Zig runtime tests, Windows standalone build and ZIP extraction/smoke checks | Host-validated |

The executable was built and tested on the Windows x64 machine recorded by the audit. ZIP tests extracted the archive to a temporary directory and ran it there, including from a different working directory. This is not a clean-machine or clean Windows VM certification.

## Not verified by this audit

| Targets / capability | Status |
|---|---|
| Linux x64, Linux ARM64, macOS x64/ARM64, Windows ARM64 | No build-and-run evidence from this audit |
| Container image | Template checks only; no image built or run |
| WASI / browser WebAssembly | No compiler/runtime support established |

The compiler/reference runtime is TypeScript and Node.js. The native runtime is a separate Zig bytecode interpreter. `hkd build --native` packages that interpreter with compiled HKDB bytecode; it is a standalone launcher, not HKD native machine-code AOT. JIT dispatch is unavailable in 1.1.0. See [`feature-matrix.md`](feature-matrix.md) and [`known-limitations.md`](known-limitations.md).

Do not infer a supported target from a target triple, CI matrix entry, adapter, or design document. A target becomes verified only after its build and representative runtime tests are run and recorded.
