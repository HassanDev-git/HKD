# HKD 1.1.0 Known Limitations & Support Boundaries

**Release Target**: HKD 1.1.0  
**Transparency Standard**: Honest Public Disclosure (Rule 2: Zero Fake Features)  

This document outlines the current boundaries, experimental features, and platform limitations of the HKD 1.1.0 release.

---

## 1. Experimental Language Features

### 1.1 Behavioral Contracts / Traits (RFC-003)
- **Status**: `EXPERIMENTAL` (Specification Approved, Runtime Lowering Scheduled for HKD 1.2).
- **Scope**: Syntax `#feature(traits)` is recognized by the compiler front-end. Dynamic dispatch vtables, trait objects (`dyn Trait`), and `impl` block compiler lowering are in active design and not yet implemented in the Stack VM.
- **Guidance**: Use structs, higher-order functions, and module composition for polymorphism in 1.1.0.

### 1.2 Linear Async / Await Syntax (RFC-004)
- **Status**: `EXPERIMENTAL` (Event Loop Operational, Language Syntax Gated).
- **Scope**: Non-blocking I/O, timers, task callbacks, and HTTP servers are fully operational via `std.task` and `std.http`. However, language-level `async fn` / `await` compiler desugaring into state machines is undergoing RFC development and targeted for stabilization in a future release.
- **Guidance**: Use `std.task` and callback-driven patterns for non-blocking workflows in 1.1.0.

---

## 2. Platform Support Tiers

### 2.1 Host Validation in This Checkout
- **Windows x86_64**: the current recovery audit passed the full Jest suite, TypeScript typecheck, Zig runtime unit tests, and standalone CLI packaging smoke checks. JIT is explicitly rejected by the native runtime; it was not executed as a working engine.
- **Linux and macOS**: no build or runtime verification was performed in this checkout.
- **AOT**: native machine-code generation is not implemented or verified in this release.
- **JIT**: the Zig machine-code emitter and manager are experimental components, but the native VM does not dispatch HKD functions through them. `--jit` returns an explicit unsupported-feature error.
- **Standalone native executable**: `hkd build --native` compiles HKD source to HKDB bytecode and appends it to the host Zig interpreter executable. It produces a native launcher, not native machine code for the HKD program.
- These checks do not establish a zero-leak guarantee or certify support on untested targets.

### 2.2 Cross-Compilation Targets
- **Linux ARM64 / aarch64** and **macOS ARM64 / Apple Silicon** are unverified by this release audit.
- Do not infer build or runtime support from target names appearing in source configuration.

### 2.3 WebAssembly (WASM / WASI)
- **Status**: `DEFERRED TO 1.2`.
- **Reasoning**: Architectural analysis (`docs/platform-wasm.md`) demonstrated that a robust WASI runtime requires either an LLVM backend bridge or a dedicated WebAssembly stack emitter. Shipping an unoptimized or fake WASM target was rejected in accordance with Rule 2.

---

## 3. Tooling & Ecosystem Limitations

### 3.1 Package Registry Hosting
- **Protocol**: Fully stable (`docs/registry-protocol.md`).
- **Package Client**: Fully stable (`hkd add`, `install`, `pack`, `lock`, `cache`, `publish`).
- **Public Server**: The global public registry service is not publicly hosted yet. Dependency management works seamlessly via local packages, file-based archives (`.hkdpack`), offline caching, and private HTTP registry endpoints.

### 3.2 Foreign Function Interface (FFI)
- **Scope**: Basic dynamic library loading and C-ABI symbol binding (`std.ffi`).
- **Limitation**: Complex C struct packing and variadic C calls require manual marshalling. Platform-specific dynamic loader conventions apply (`.dll` on Windows, `.so` on Linux).

### 3.3 Serverless & Cloud Deployments
- **Docker / Linux Containers**: Dockerfile generation has automated tests; this audit did not build or run a container image.
- **Vercel Adapter**: Marked as `EXPERIMENTAL`. Serverless wrapper generation functions for single-file API routes, but complex multi-file modules require container deployment.
