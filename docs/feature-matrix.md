# HKD Feature and Capability Matrix

**Version audited:** 1.1.0 (Phase 10.3 local audit, 2026-10-24)
**Evidence:** `artifacts/phase10.3-final-release-verification.json`, Windows x64 only.

This matrix describes observable implementation status. A file or emitter existing in the repository does not mean the feature is connected to program execution.

| Capability | Status | Evidence / boundary |
|---|---|---|
| TypeScript compiler and reference Stack VM | Implemented | Full local Jest suite and release verification passed. |
| Zig bytecode interpreter | Implemented | Built and 9 Zig unit tests passed; native execution covered by parity tests. |
| `hkd build --native` standalone launcher | Implemented | Embeds HKDB bytecode in the Zig runtime; it does not compile HKD programs to machine code. |
| JIT execution | Not implemented | Emitter and manager components exist, but dispatch is not integrated; `--jit` exits 2 with an explicit diagnostic. |
| Native machine-code AOT | Not implemented | No HKD source-to-machine-code compiler path was found. |
| Language traits / RFC-003 | Experimental | Compiler and runtime coverage is partial; see `docs/rfc-003-status.md`. |
| Language async/await / RFC-004 | Experimental | Language lowering is not complete; async library APIs do not imply `async fn` support. |
| Linux, macOS, ARM64 runtime/release | Not verified by this audit | Target strings or CI configuration do not establish a passing build or runtime check. |
| Container image | Not verified by this audit | Templates are checked; no image was built and run. |
| WASM/WASI compilation | Not implemented in this release | Deferred; see `docs/platform-wasm.md`. |

“Implemented” here means present and exercised in the stated local checks. It does not claim formal verification, complete language compatibility, or universal production suitability. See [`known-limitations.md`](known-limitations.md) for scope and remaining limits.
