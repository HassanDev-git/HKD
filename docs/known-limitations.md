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

### 2.1 Tier 1: Primary Host & Runtime Targets
- **Windows x86_64** (Native Stack VM, Native Runtime, JIT, AOT, Tooling, LSP/DAP).
- **Linux x86_64** (Native Stack VM, Native Runtime, JIT, AOT, Tooling, Containerized Deployment).
- **Guarantee**: Full CI test coverage, automated differential parity, and zero memory leaks.

### 2.2 Tier 2: Cross-Compilation Targets
- **Linux ARM64 / aarch64** (Build-validated cross-target compilation via `--target linux-arm64`).
- **macOS ARM64 / Apple Silicon** (Build-validated cross-target compilation via `--target darwin-arm64`).
- **Limitation**: Native runtime execution is validated on x86_64 host environments; ARM64 execution relies on target platform compatibility and is build-verified.

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
- **Docker / Linux Containers**: Fully supported and certified with multi-stage non-root images.
- **Vercel Adapter**: Marked as `EXPERIMENTAL`. Serverless wrapper generation functions for single-file API routes, but complex multi-file modules require container deployment.
