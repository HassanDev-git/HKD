# HKD 1.1.0

We are proud to announce the official release of **HKD 1.1.0** — featuring a dual-engine execution architecture (Reference Stack VM + High-Performance Register VM), optimizing compiler pipeline, Native Zig runtime parity, first-class structured concurrency, and a unified developer platform.

## Highlights
- **Dual-Engine Architecture**: Reference Stack VM provides authoritative semantic verification, while the 3-address Register VM delivers high-throughput execution across arithmetic, recursion, and object manipulation.
- **Runtime Execution Specialization**: Direct native call fast dispatch (`call1`, `call2`) eliminating transient argument array allocations, with inlined indexing and field mutation.
- **Call Frame Pooling & Optimization**: Lowers recursion allocation overhead by pooling execution frames and caching closures for non-capturing functions.
- **Enterprise Developer Toolchain**: Integrated compiler, package manager (`hkd add`, `hkd vendor`, hermetic `.hkdpack`), LSP 2.0 language server, DAP 2.0 debugger adapter, formatter, linter, and clean-room testing.
- **Deterministic & Reproducible**: 100% bit-for-bit identical bytecode and archive outputs across independent compilation passes.

## Verification
- **Suites**: 120 / 120 PASS
- **Tests**: 1,043 / 1,043 PASS
- **TypeScript Errors**: 0 (`tsc --noEmit` clean)
- **Differential Parity**: 100% (Stack VM ↔ Register VM ↔ Native Zig VM)
- **Release Verification**: 18 / 18 dimensions PASS (`hkd verify-release`)

## Getting Started
Refer to the Quick Start in [README.md](https://github.com/HassanDev-git/HKD#quick-start):
```bash
hkd version
hkd doctor

hkd init my-app
cd my-app

hkd run
hkd test
```
