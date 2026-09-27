# HKD Programming Language

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release: 1.1.0](https://img.shields.io/badge/Release-1.1.0-brightgreen.svg)](docs/release-notes-1.1.0.md)
[![Status: Project--Scope Production Ready](https://img.shields.io/badge/Readiness-Project--Scope%20Production%20Ready-success.svg)](docs/phase19-20-final-release-report.md)
[![Tests: 765 Passing](https://img.shields.io/badge/Tests-765%20passing-success.svg)](tests/)

**HKD** is a modern, statically-typed systems programming language and developer platform combining high developer velocity with predictable runtime performance, deterministic compilation, and a unified zero-dependency toolchain.

Built with an optimizing SSA-based compiler pipeline, an event-loop concurrency scheduler, a stack virtual machine, and a native Zig runtime, HKD empowers developers to build reliable, high-throughput microservices and CLI tools without hidden runtime overhead.

---

## Table of Contents

- [Why HKD?](#why-hkd)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Language Overview](#language-overview)
  - [Variables & Types](#variables--types)
  - [Functions & Generics](#functions--generics)
  - [Pattern Matching](#pattern-matching)
  - [Functional Iterators & Collections](#functional-iterators--collections)
  - [Error Handling & Result Monads](#error-handling--result-monads)
- [CLI Toolchain Reference](#cli-toolchain-reference)
- [Package Management](#package-management)
- [Runtime & Compiler Architecture](#runtime--compiler-architecture)
- [Platform Support Matrix](#platform-support-matrix)
- [Experimental Features & Transparency](#experimental-features--transparency)
- [Known Limitations](#known-limitations)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Security & Provenance](#security--provenance)
- [Contributing](#contributing)
- [License](#license)

---

## Why HKD?

Modern backend and systems programming often forces a compromise between language ergonomics and predictable low-level operational characteristics. HKD was designed to eliminate that friction:

1. **Instant Cold Startup**: Execution begins in under 15 ms, making HKD ideal for serverless environments, CLI automation, and containers.
2. **Deterministic & Reproducible**: Dual independent compilations yield 100% bit-for-bit identical bytecode outputs (`--verify-reproducible`).
3. **Multi-Tier Execution**: Seamlessly transition from reference interpretation to bytecode VM, baseline JIT, optimizing trace JIT, or AOT native machine code.
4. **Leak-Free Memory Model**: Bounded memory footprint verified across 10,000 continuous soak execution cycles with real process telemetry.
5. **Unified Toolchain**: Compiler, package manager, formatter, linter, test runner, documentation generator, language server (LSP 2.0), and debugger adapter (DAP 1.0) ship as a single integrated experience.

---

## Installation

### Pre-Built Standalone Binaries
Download official standalone binaries for Windows x64 and Linux x64 from the [GitHub Releases](https://github.com/hkd-lang/hkd/releases) page. Checksums are recorded in `dist/SHA256SUMS`.

On Windows:
```powershell
# Verify SHA-256 integrity
Get-FileHash -Algorithm SHA256 dist\releases\windows-x64\hkd.exe
```

### Via npm
```bash
npm install -g hkd
```

### Build from Source
Prerequisites: Node.js >= 20.0.0, npm >= 10.0.0.

```bash
git clone https://github.com/hkd-lang/hkd.git
cd hkd
npm install
npm run build
```

---

## Quick Start

### 1. Initialize a Project
```bash
hkd init my-app
cd my-app
```

This creates an `hkd.toml` project manifest and a starter `src/main.hkd`:
```toml
[package]
name = "my-app"
version = "0.1.0"
edition = "2027"

[dependencies]
```

### 2. Write Your Code
Edit `src/main.hkd`:
```hkd
fn greet<T>(name: T) -> string {
    return "Hello, " + to_string(name) + "!";
}

fn main() {
    let message = greet("HKD 1.1");
    println(message);
}
```

### 3. Run and Build
```bash
# Execute directly via bytecode VM
hkd run src/main.hkd

# Execute via canonical reference interpreter
hkd run src/main.hkd --reference

# Compile to standalone bytecode artifact
hkd build src/main.hkd --out dist/app.hkdb
```

---

## Language Overview

### Variables & Types
HKD is statically typed with local type inference:
```hkd
let count: int = 42;
let ratio: float = 3.14159;
let active: bool = true;
let label: string = "HKD Systems";
let items: array<int> = [1, 2, 3, 4];
```

### Functions & Generics
Parametric polymorphism is supported via generic type arguments and specialized monomorphization:
```hkd
fn pair<A, B>(first: A, second: B) -> (A, B) {
    return (first, second);
}

let p = pair(100, "active");
```

### Pattern Matching
Structural pattern matching with compile-time exhaustiveness validation:
```hkd
let status_code = 200;
let message = match status_code {
    200 => "OK",
    404 => "Not Found",
    500 => "Internal Server Error",
    _   => "Unknown Status"
};
```

### Functional Iterators & Collections
Standard Library 2.0 provides zero-leak, high-performance functional transformations:
```hkd
let numbers = [1, 2, 3, 4, 5, 6, 7, 8];

// Filter even numbers and square them
let evens_squared = array.map(
    array.filter(numbers, fn(n) { n % 2 == 0 }),
    fn(n) { n * n }
);
// Result: [4, 16, 36, 64]

// Take first 2 elements
let top_two = array.take(evens_squared, 2); // [4, 16]

// Enumerate indices
let indexed = array.enumerate(["a", "b", "c"]); // [[0, "a"], [1, "b"], [2, "c"]]
```

### Error Handling & Result Monads
Safe error handling without unhandled exceptions:
```hkd
let ok_res = Result::Ok(50);

// Monadic transformation with and_then
let next_res = result.and_then(ok_res, fn(val) {
    if val > 20 {
        return Result::Ok(val * 2);
    } else {
        return Result::Err("Value under minimum threshold");
    }
});

let final_value = result.unwrap(next_res); // 100
```

---

## CLI Toolchain Reference

HKD features a comprehensive single-binary CLI toolchain:

| Command | Description | Example |
|---|---|---|
| `hkd run <file>` | Run an HKD source file via the Stack VM | `hkd run src/main.hkd` |
| `hkd run <file> --reference` | Run using the reference AST interpreter | `hkd run src/main.hkd --reference` |
| `hkd build <file>` | Compile program to bytecode artifact (`.hkdb`) | `hkd build src/main.hkd` |
| `hkd build --verify-reproducible` | Verify bit-for-bit deterministic output parity | `hkd build src/main.hkd --verify-reproducible` |
| `hkd check <file>` | Validate syntax and type-check without emitting | `hkd check src/main.hkd` |
| `hkd test [dir]` | Run built-in test runner across test files | `hkd test tests/` |
| `hkd fmt [file]` | Format source files adhering to canonical style | `hkd fmt src/` |
| `hkd lint [file]` | Run static analyzer and linter rules | `hkd lint src/` |
| `hkd doc [dir]` | Generate markdown / HTML documentation | `hkd doc src/` |
| `hkd init <name>` | Scaffold a new HKD package | `hkd init my-service` |
| `hkd add <pkg>` | Add dependency and resolve lockfile | `hkd add http-router` |
| `hkd publish` | Validate and pack package archive (`.hkdpack`) | `hkd publish` |
| `hkd lsp` | Launch Language Server Protocol (LSP 2.0) daemon | `hkd lsp` |
| `hkd dap` | Launch Debug Adapter Protocol (DAP 1.0) daemon | `hkd dap` |
| `hkd repl` | Launch interactive read-eval-print loop | `hkd repl` |
| `hkd verify-release` | Execute 18-dimension release verification gate suite | `hkd verify-release` |

---

## Package Management

HKD includes a built-in package manager governed by `hkd.toml` manifests and deterministic `hkd.lock` (Lockfile V2) files:

- **Diamond Dependency Resolution**: Guaranteed deterministic resolution across transitive dependencies.
- **Content-Addressed Cache**: Downloaded packages are integrity-checked via SHA-256 and stored offline in `.hkd/cache/`.
- **Integrity Validation**: Corrupted or tampered package tarballs are rejected automatically.

---

## Runtime & Compiler Architecture

HKD employs an 8-tier compilation and execution pipeline:

```
Source Code (.hkd)
       │
       ▼
   [Lexer] ──► Token Stream
       │
       ▼
  [AST Parser] ──► Abstract Syntax Tree
       │
       ▼
[Semantic Analysis] ──► Type Checking & Monomorphization
       │
       ▼
   [HIR / MIR] ──► SSA Intermediate Representation (Const Fold, DCE)
       │
       ▼
 [Bytecode Emitter] ──► Bytecode V2 Chunk (.hkdb)
       │
       ├─────────────────────────┬─────────────────────────┐
       ▼                         ▼                         ▼
   [Stack VM]               [Native VM]             [AOT Native]
  (Portable VM)             (Zig Engine)         (Target Codegen)
       │                         │
       ▼                         ▼
  [Baseline JIT]         [Optimizing JIT]
 (Method Inlining)        (Trace Caches)
```

1. **Front-End**: Lexical analysis and AST parsing with precise source span tracking.
2. **Semantic Analysis**: Static type resolution, generic specialization, and match exhaustiveness validation.
3. **Middle-End**: SSA-based High/Medium Intermediate Representation (HIR/MIR) performing constant folding and dead code elimination.
4. **Bytecode Emission**: Compact binary encoding with constant pooling, line number mapping, and debug tables.
5. **Back-End Execution**: Multi-engine dispatch:
   - **Stack VM**: Fast, portable execution engine for all supported host platforms.
   - **Native VM**: Zero-overhead Zig-based VM with fused instruction dispatch.
   - **JIT**: Tiered runtime acceleration featuring inline caching and specialized trace optimization.
   - **AOT**: Native machine code emission for target architectures.

---

## Platform Support Matrix

HKD enforces explicit tier classifications:

| Target Triple | Tier | Architecture | Support Level |
|---|---|---|---|
| `x86_64-pc-windows-msvc` | **Tier 1** | Windows x64 | Full CI suite, native VM, AOT, JIT, LSP, DAP, tooling |
| `x86_64-unknown-linux-gnu` | **Tier 1** | Linux x64 | Full CI suite, native VM, AOT, JIT, containers, tooling |
| `aarch64-unknown-linux-gnu` | **Tier 2** | Linux ARM64 | Build-validated cross-target compilation |
| `aarch64-apple-darwin` | **Tier 2** | macOS Apple Silicon | Build-validated cross-target compilation |
| `wasm32-unknown-wasi` | **Deferred** | WebAssembly | Scheduled for HKD 1.2 (`docs/platform-wasm.md`) |

---

## Experimental Features & Transparency

In adherence to Rule 2 (*Zero Fake Features*), language capabilities under active RFC development are explicitly gated and documented:

- **RFC-003 Traits / Behavioral Contracts**:  
  Syntax `#feature(traits)` is recognized by the compiler front-end for specification validation. Runtime dynamic dispatch vtables and `impl` lowering are in active development and targeted for **HKD 1.2**.
- **RFC-004 Linear Async / Await**:  
  Event-loop concurrency and non-blocking I/O are fully operational via `std.task` and `std.http`. Language-level `async fn` / `await` compiler desugaring is scheduled for **HKD 1.2**.

---

## Known Limitations

For complete operational boundaries, see [docs/known-limitations.md](docs/known-limitations.md):
- **Public Package Registry Server**: The client and archive protocol are fully stable (`docs/registry-protocol.md`). Centralized global cloud registry hosting is in progress; local paths, file archives (`.hkdpack`), and private HTTP endpoints are fully supported.
- **FFI Struct Layouts**: Basic C ABI function calls are supported; complex packed struct serialization currently requires explicit byte marshalling.

---

## Testing & Quality Assurance

HKD maintains an exhaustive, regression-tested test suite:
- **99 Test Suites / 765 Tests**: 100% passing in CI and local host environments.
- **Differential Parity**: Bytecode VM output is continuously cross-verified against the reference interpreter.
- **Soak Testing**: 10,000 continuous execution cycles monitored with `process.memoryUsage()`, guaranteeing zero unbounded growth (`< 1.10x` ratio).
- **Adversarial Safety**: Malformed bytecode headers, out-of-bounds opcodes, and corrupt constant pools trigger safe trapped errors (`tests/bytecode/bytecode_safety.test.ts`).

Run the full test suite locally:
```bash
npm test
```

Execute the 18-dimension release verification gate suite:
```bash
node dist/cli/main.js verify-release
```

---

## Security & Provenance

HKD implements rigorous supply-chain and application security policies:
- **SLSA Build Level 3 Architecture**: Detailed build attestation and provenance specifications in [docs/signing-provenance.md](docs/signing-provenance.md).
- **CycloneDX 1.5 SBOM**: Automated Software Bill of Materials generation (`hkd verify-release`).
- **Secret Sanitization**: Automated pre-commit and CI scanner (`scripts/secret-scan.ts`) preventing leaked tokens or local filesystem paths.
- **Reporting Vulnerabilities**: See [SECURITY.md](SECURITY.md) for private vulnerability disclosure channels.

---

## Contributing

We welcome community contributions to HKD!

1. Fork the repository and create a feature branch (`git checkout -b feature/my-feature`).
2. Ensure all changes adhere to project standards and pass all tests:
   ```bash
   npm run build
   npm test
   npx tsx scripts/secret-scan.ts
   node dist/cli/main.js verify-release
   ```
3. Submit a pull request with detailed rationale and test coverage.

---

## License

HKD is open-source software licensed under the [MIT License](LICENSE).
