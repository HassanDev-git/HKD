# Changelog

All notable changes to the HKD programming language ecosystem are documented in this file.

## [1.1.0] - 2026-09-04: Language Evolution, Ecosystem Completion & Production Hardening

### Added
* **Standard Library 2.0 Functional Iterators & Result Monads**:
  * Functional array pipelines: `array.map`, `array.filter`, `array.take`, `array.skip`, `array.zip`, `array.enumerate`, `array.any`, `array.all` (`src/stdlib/index.ts`).
  * Monadic error handling: `result.map`, `result.map_err`, `result.and_then`, `result.unwrap_err`.
* **Language Evolution & Type System Specification**:
  * Formal Type System 2.0 specification (`docs/type-system.md`) covering generics substitution, pattern exhaustiveness, and Result monads.
  * Generics (RFC-001) and Pattern Matching (RFC-002) production hardening under Edition 2027.
  * Transparent diagnostic feature gates for experimental syntax: `#feature(traits)` and `#feature(async)`.
* **Real-World Production Reference Microservice**:
  * Complete, runnable production service example (`examples/real-world/production-style-service/`) with configuration, structured JSON logging, health and metrics endpoints, and graceful connection draining.
* **Release Verification & Security Architecture**:
  * Evidence-based 18-dimension release verification engine (`hkd verify-release --json`) emitting `artifacts/release-verification.json`.
  * SLSA Level 3 signing and provenance specification (`docs/signing-provenance.md`).
  * Threat model and memory isolation boundaries (`docs/threat-model.md`, `docs/security-boundaries.md`).
  * Automated secret and sensitive path scanner (`scripts/secret-scan.ts`).
  * Cryptographic release manifests (`dist/artifacts.json`, `dist/SHA256SUMS`).
* **Packaging & Ecosystem Hardening**:
  * Multi-package transitive dependency graph resolution and offline cache recovery (`tests/package/golden_workflow.test.ts`).
  * Bytecode error resilience against corrupted, truncated, or invalid magic headers (`tests/bytecode/bytecode_safety.test.ts`).
  * Automated documentation example execution suite (`tests/docs/doc_examples.test.ts`).
* **Performance Regression Baseline**:
  * Real host performance baseline recorded in `benchmarks/baseline-1.1.json` with system environment attestation (`benchmarks/results/system-environment.json`).
  * Formal variance and regression policy (`docs/performance-regression-policy.md`).

### Changed
* **Production Readiness Validation**: Certified under Project-Scope Production Readiness Validation with 0 release blockers and all HIGH/CRITICAL severities human-guarded.
* **Version Alignment**: Toolchain, CLI, compiler, and standard library synchronized to `1.1.0`.
* **Security Policy**: Updated `SECURITY.md` with transparent vulnerability reporting mechanisms and elimination of synthetic SLAs.

## [1.0.0] - 2026-09-04: Language Freeze, Conformance, Security Audit & General Availability

### Added
* **Formal Language Specification & Architecture Documentation**:
  * Normative Language Specification (`docs/spec.md`) and Language Reference (`docs/language-reference.md`).
  * Formal EBNF Grammar Specification (`docs/grammar.md`).
  * Operational Semantics and Memory Model (`docs/semantics.md`).
  * Backward Compatibility and Edition Evolution Policy (`docs/compatibility.md`, `docs/editions.md`).
  * Binary Bytecode Format and ABI Invariants (`docs/bytecode-format.md`, `docs/bytecode-compatibility.md`, `docs/runtime-abi.md`).
  * Standardized CLI Specification and Exit Code Standard (`docs/cli.md`).
  * Unified Error Code Catalogue E101–E503 (`docs/error-codes.md`).
  * Migration Guide to 1.0 and Deprecation Policy (`docs/migration-1.0.md`, `docs/deprecation-policy.md`).
* **Multi-Tier Language Conformance Suite**:
  * Syntax conformance covering all literals, operators, and struct syntax (`tests/conformance/syntax.test.ts`).
  * Operational semantics covering block scoping, shadowing, and evaluation order (`tests/conformance/semantics.test.ts`).
  * Type system conformance verifying primitive types, conversions, and `type_of` (`tests/conformance/types.test.ts`).
  * Functions and closures conformance (`tests/conformance/functions_and_closures.test.ts`).
  * Control flow conformance covering conditionals, loops, break, and continue (`tests/conformance/control_flow.test.ts`).
  * Modules and imports conformance with caching and circular dependency detection (`tests/conformance/modules_and_imports.test.ts`).
  * Standard library contract verification for math, string, array, json, path, env, random (`tests/conformance/stdlib_contract.test.ts`).
  * Canonical error diagnostic verification (`tests/conformance/errors_and_diagnostics.test.ts`).
* **Automated Developer & Release Tooling**:
  * `hkd migrate` project upgrader to Edition 2026 with `.bak` safety backups (`src/tooling/migrate.ts`).
  * `hkd verify-release` automated acceptance gates runner (`src/tooling/verify-release.ts`).
  * `hkd test --conformance` and `hkd test --differential` testing flags.
  * Cross-runtime differential testing engine writing `reports/differential-final.json` (`src/tooling/differential.ts`).
  * Doctor 2.0 system diagnostics covering compiler, runtime, targets, LSP, DAP, cache, containers, and VS Code.
* **Comprehensive Test Coverage & Quality**:
  * Expanded automated test suite to **601 passing tests** across **66 test suites** (100% passing, 0 leaks).
  * Concurrency and stress testing on hardened HTTP server (`tests/deploy/concurrency_stress.test.ts`).
  * Hostile payload and adversarial syntax fuzzing (`tests/security/conformance_fuzzing.test.ts`).
  * Seed corpus in `fuzz/corpus/`.

### Changed
* **Language Freeze**: Syntax, bytecode layout, runtime ABI, and CLI exit codes (0..5) officially frozen for 1.0.0.
* **Edition Baseline**: Edition 2026 established as the canonical baseline.
* **Performance Baseline**: Final locked performance benchmarks recorded in `reports/performance-final.json`.

## [Phase 9] - 2026-09-03: Native Performance 2.0 & Compiler Optimization

### Added
* **HIR/MIR Intermediate Representation**:
  * Control Flow Graph (CFG) representation with Basic Blocks (`src/ir/cfg.ts`).
  * Constant folding and constant propagation passes (`src/ir/optimizer.ts`).
  * Dead code elimination (DCE) removing unreachable blocks.
  * Jump threading and basic block flattening to improve instruction locality.
  * Virtual register linear instruction stream (MIR) serving as foundation for future JIT/AOT lowering.
* **Specialized VM Opcodes**:
  * Fused comparison-jump instructions `JumpIfGreater` (0x54) and `JumpIfLess` (0x55) in native Zig VM.
* **Inline Caching**:
  * 256-entry monomorphic inline cache for `GetField` and `SetField` property lookups with shape tagging.
* **Small String Optimization (SSO) & Buffer Amortization**:
  * Inline storage for strings up to 24 bytes.
  * Geometric capacity growth ($1.5\times$) for string concatenation and array allocations.
* **Native Thread Concurrency**:
  * Background `WorkerPool` with atomic spinlock-protected ring buffer in `native-runtime/src/runtime/worker_pool.zig`.
  * Integration into `Scheduler` for offloading CPU-bound tasks.
* **SIMD Investigation**:
  * Microbenchmark proving 2.32x speedup on vector floating point reductions with `@Vector(4, f64)`.
* **Security & Fuzzing**:
  * Random mutation fuzz tests validating resilience against corrupted bytecodes without crashes or panics.
* **Cross-Platform Compilation**:
  * Verified ReleaseFast compilation targets for Windows x86_64, Linux x86_64, and macOS aarch64.

### Changed
* **Memory Management**:
  * In-place hash map updates for `SetIndex` and `SetField`, eliminating duplicate key string allocations.
  * Sub-VM module cache deduplication.
  * Zero memory leaks verified via `TrackingAllocator` over 100,000 object allocations.
* **Binary Size**:
  * Stripped ReleaseFast native binary under 1.05 MB (over 68% size reduction).
* **Startup Performance**:
  * Cold startup benchmarked at 10.99 ms (8.0x faster than Node.js v24 V8).

### Fixed
* Fixed integer underflow panic during filesystem module import by ensuring `active_ctx` properly anchors to caller context.
* Made `osSleep` and `osGetTickCount64` portable across Windows, Linux, and macOS without libc requirements.
* Achieved 100% test pass rate across 201 tests in all 11 test suites.
