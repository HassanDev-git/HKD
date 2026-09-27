# HKD Phase 15: Architecture Audit & Subsystem Inventory

## 1. Executive Summary

This architecture audit provides an exhaustive inspection of the HKD language implementation across Phases 0 through 14. It establishes the baseline for the **HKD 1.0.0 Release Freeze**, detailing subsystem dependencies, safety invariants, memory ownership contracts, and verified platform capabilities.

---

## 2. Subsystem Map & Dependency Topology

```
                  ┌──────────────────────┐
                  │ Source Files (*.hkd) │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │     Lexer (E1xx)     │
                  └──────────┬───────────┘
                             │ Tokens
                             ▼
                  ┌──────────────────────┐
                  │    Parser (E2xx)     │
                  └──────────┬───────────┘
                             │ AST (Concrete Syntax Tree)
                             ▼
                  ┌──────────────────────┐
                  │ Semantic Analyser    │
                  │       (E3xx)         │
                  └──────────┬───────────┘
                             │ Typed AST / Symbol Tables
                             ▼
                  ┌──────────────────────┐
                  │   HIR Desugaring     │
                  └──────────┬───────────┘
                             │ Canonical HIR
                             ▼
                  ┌──────────────────────┐
                  │ SSA-ready MIR & Opt  │
                  └──────────┬───────────┘
                             │ Optimized IR
                             ▼
        ┌────────────────────┴────────────────────┐
        │                                         │
        ▼                                         ▼
┌──────────────┐                          ┌──────────────┐
│   Bytecode   │                          │ Native x86_64│
│   Compiler   │                          │ Machine Code │
└───────┬──────┘                          └───────┬──────┘
        │                                         │
        ▼                                         ▼
┌──────────────┐                          ┌──────────────┐
│  Stack VM /  │                          │ Native JIT & │
│ Reference RT │                          │ AOT Engine   │
└───────┬──────┘                          └───────┬──────┘
        │                                         │
        └────────────────────┬────────────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │ Hardened Stdlib &    │
                  │ Production Runtime   │
                  └──────────┬───────────┘
                             │
       ┌─────────────────────┼─────────────────────┐
       │                     │                     │
       ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ Package Mgr  │      │ LSP 2.0 &    │      │ Multi-Stage  │
│ (.hkdpack)   │      │ DAP Debugger │      │ Deployments  │
└──────────────┘      └──────────────┘      └──────────────┘
```

---

## 3. Subsystem Inventory & Invariant Audit

### 3.1 Frontend (`src/lexer/`, `src/parser/`, `src/semantic/`)
- **Lexer**: Deterministic single-pass scanner with line/column tracking. All tokens carry exact `SourceSpan`. Error codes `E101`–`E105`.
- **Parser**: Recursive descent parser with operator precedence. Produces strongly-typed AST nodes. Emits `E201`–`E206`.
- **Semantic Analyser**: Multi-pass analyzer:
  1. Scope creation and symbol declaration.
  2. Type inference and constraint validation.
  3. Mutability and lifetime checks.
  Emits `E301`–`E312`.

### 3.2 Intermediate Representation & Optimizer (`src/ir/`, `src/optimizer/`)
- **HIR**: High-Level Intermediate Representation with canonical desugaring of loops, conditionals, and pattern matching.
- **MIR / SSA**: Static Single Assignment form with dominance frontiers, phi nodes, and explicit control-flow graphs (CFG).
- **Optimizer Pipeline**:
  - Constant folding & algebraic simplification.
  - Dead code elimination (DCE).
  - Copy propagation & Common Subexpression Elimination (CSE).
  - Loop Invariant Code Motion (LICM).
  - Escape analysis & Scalar Replacement of Aggregates (SROA).
  - Inlining & Tail Call Optimization (TCO).

### 3.3 Execution Tiers (`src/vm/`, `native-runtime/`, `src/jit/`)
1. **Tier 0: Stack Virtual Machine** (`src/vm/vm.ts`):
   - Reference bytecode interpreter.
   - Operates on serialized `.hkdb` chunks.
   - Guaranteed deterministic execution semantics.
2. **Tier 1: Native Zig Baseline Runtime** (`native-runtime/`):
   - Zero-dependency native executable compiled via Zig.
   - High-performance register-mapped VM with direct threading.
3. **Tier 2: Native Optimizing JIT with PGO** (`src/jit/`, `native-runtime/src/jit/`):
   - Genuine x86_64 machine code generation into `W^X` executable memory.
   - Runtime profiling, type specialization, inline caches (IC).
   - Deoptimization bailouts to interpreter upon guard failure.
4. **Tier 3: Standalone Native AOT Executable**:
   - Concatenated binary format: `[runtime_bytes] + [hkdb_bytes] + [u64 length] + "HKDSTAND"`.
   - Executes with zero Node.js or external tool dependencies.

### 3.4 Package Ecosystem & Security (`src/package-manager/`)
- SemVer 2.0 resolution with deterministic satisfiability solver.
- Content-addressed package cache keyed by SHA-256 digests.
- Deterministic TOML Lockfile V2 (`hkd.lock`).
- Hermetic package archive creation (`.hkdpack`).
- Supply-chain security audit via `hkd audit`.

### 3.5 Developer Tooling (`src/lsp/`, `src/debug/`, `vscode-extension/`)
- Language Server Protocol 2.0 (`hkd lsp`): diagnostics, completion, hover, definition, rename, formatting, semantic tokens.
- Debug Adapter Protocol (`hkd dap`): breakpoints, stepping, stack inspection, variable evaluation.
- Diagnostics doctor (`hkd doctor`): system health, native runtime availability, toolchain readiness.

### 3.6 Production Deployment & Runtime (`src/deploy/`)
- Canonical target triples: `x86_64-windows`, `x86_64-linux`, `aarch64-macos`, `aarch64-linux`.
- Build profiles: `debug`, `release`, `size` (`-Oz`), `speed` (`-O3`), `release-pgo`.
- Release bundles: standalone binary, `artifact.json`, `SHA256SUMS`, CycloneDX 1.5 JSON SBOM.
- Hardened HTTP server: socket pooling, rate limits, `/health`, `/ready`, `/metrics`, graceful drain.
- Multi-stage Docker containerization with non-root UID/GID 10001.

---

## 4. Safety & Invariant Verification Findings

1. **Callee Push Order Invariant**:
   - Fixed callee vs argument push ordering in `compileTest` and `compileAssert`.
   - Verified that all `Op.Call` invocations follow the strict `[callee, arg1, ... argN]` convention.
2. **SHA-256 Digest Self-Inclusion**:
   - Verified that `SHA256SUMS` generation and validation strictly excludes `SHA256SUMS` from self-hashing.
3. **Memory Ownership**:
   - Native Zig runtime implements deterministic retain/release reference counting for heap-allocated strings, arrays, and objects with zero reported leaks.
4. **Secret Boundary**:
   - Any identifier containing `key`, `secret`, `token`, `password`, `auth`, or `credential` is masked as `********` across logs, diagnostics, and environment inspect tools.

---

## 5. Deprecation & Cleanup Decisions

1. **Lockfile V1**: Formally deprecated. Automatically upgraded to Lockfile V2 via `hkd migrate` and `hkd install`.
2. **Pre-Edition 2026 syntax**: Standardized on Edition 2026 grammar.
3. **Dead code**: All experimental temporary scripts in scratch directories are isolated from the production distribution.
