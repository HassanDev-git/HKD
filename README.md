# HKD Programming Language

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release: 1.1.0](https://img.shields.io/badge/Release-1.1.0-brightgreen.svg)](docs/release-notes-1.1.0.md)
[![Status: Local release audit not ready](https://img.shields.io/badge/Readiness-Local%20audit%20not%20ready-orange.svg)](artifacts/release-verification.json)
[![Tests: 1043 Passing](https://img.shields.io/badge/Tests-1043%20passing-success.svg)](tests/)

**HKD** is a statically typed programming language and developer toolchain with a compiler, reference virtual machine, optional native runtime, package manager, and editor integrations.

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

1. **Static typing**: Type checking, functions, structs, and generics are part of the compiler; some language features remain edition-gated or experimental.
2. **Two execution paths**: The TypeScript reference VM is included in the CLI. A native Zig bytecode runtime is available for supported builds.
3. **Integrated tooling**: The repository includes package management, formatting, linting, testing, documentation, LSP, DAP, and a VS Code extension.
4. **Reproducibility checks**: The compiler has a byte-for-byte build verification command and regression tests.

---

## Installation

### Pre-Built Standalone Binaries
This checkout includes a locally rebuilt Windows x64 standalone executable and ZIP. The Phase 10.3 audit verified those files on its Windows x64 host; it did not publish a release or verify Linux, macOS, or ARM64 artifacts. See `dist/artifacts.json` and `dist/SHA256SUMS` for this checkout's artifact inventory.

Local ZIP: `dist/releases/hkd-v1.1.0-windows-x64.zip`

On Windows:
```powershell
# Verify SHA-256 integrity
Get-FileHash -Algorithm SHA256 .\hkd.exe

# Use the CLI from a terminal
.\hkd.exe --help
```

HKD is a command-line program. Double-clicking it prints help and exits with the process; use PowerShell or Windows Terminal to keep command output visible. The standalone CLI runs regular HKD programs with its bundled TypeScript VM when the separate native runtime is unavailable. `--jit` is unavailable in this release; other native VM options require the companion `hkd-runtime`.

### Via npm
```bash
npm install -g hkd
```

### Build from Source
Prerequisites: Node.js >= 20.0.0, npm >= 10.0.0.

```bash
git clone https://github.com/HassanDev-git/HKD.git
cd HKD
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
The standard library provides functional collection transformations:
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
| `hkd verify-release` | Execute the release verification gate suite | `hkd verify-release` |

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
   [Stack VM]               [Native VM]
  (TypeScript)              (Zig Engine)
       │                         │
       └──── Standalone bytecode bundle ────┘
```

1. **Front-End**: Lexical analysis and AST parsing with precise source span tracking.
2. **Semantic Analysis**: Static type resolution, generic specialization, and match exhaustiveness validation.
3. **Middle-End**: SSA-based High/Medium Intermediate Representation (HIR/MIR) performing constant folding and dead code elimination.
4. **Bytecode Emission**: Compact binary encoding with constant pooling, line number mapping, and debug tables.
5. **Back-End Execution**: Multi-engine dispatch:
   - **Stack VM**: Fast, portable execution engine for all supported host platforms.
   - **Native VM**: Zig-based VM with fused instruction dispatch.
   - **JIT**: Machine-code emitter experiments exist, but JIT dispatch is not integrated into VM execution in this release.
   - **Standalone bundle**: `hkd build --native` embeds compiled HKDB bytecode in the host Zig runtime executable; it does not generate machine code from the HKD program.
   - **Native machine-code AOT**: Not implemented in this release.

---

## Platform Support Matrix

This table records the scope of the current local release audit:

| Target Triple | Tier | Architecture | Support Level |
|---|---|---|---|
| `x86_64-pc-windows-msvc` | Host-validated | Windows x64 | Local tests and standalone CLI packaging |
| `x86_64-unknown-linux-gnu` | Not verified here | Linux x64 | No Linux build was run in this audit |
| `aarch64-unknown-linux-gnu` | Not verified here | Linux ARM64 | No cross-target build was run in this audit |
| `aarch64-apple-darwin` | Not verified here | macOS Apple Silicon | No cross-target build was run in this audit |
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

HKD maintains Jest unit, integration, conformance, compatibility, fuzz-regression, deployment, and packaging checks. The latest full local Windows run on 2026-10-24 passed **120 suites and 1,043 tests**. The packaging workflow separately exercises the standalone executable from a clean temporary directory.

Run the full test suite locally:
```bash
npm test
```

Run the evidence-based release verification probes. Untested high-severity areas block readiness:
```bash
node dist/cli/main.js verify-release
```
The current local audit reports a host-scoped result. It distinguishes the supported standalone bytecode bundle from unavailable JIT dispatch and native machine-code AOT; see the generated report for remaining gates.

---

## Security & Provenance

HKD implements rigorous supply-chain and application security policies:
- **Build provenance design**: See [docs/signing-provenance.md](docs/signing-provenance.md); no SLSA level is claimed for this build.
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
