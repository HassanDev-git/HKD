# HKD Programming Language

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release: 1.1.0](https://img.shields.io/badge/Release-1.1.0-brightgreen.svg)](docs/release-notes-1.1.0.md)

**HKD** is a statically typed programming language under active development. This repository contains its TypeScript compiler and reference VM, a Zig bytecode interpreter, package manager, command-line tools, language server, debugger protocol support, and VS Code extension.

The CLI can execute compiled HKD bytecode with the TypeScript reference VM or the Zig runtime. The Zig runtime interprets bytecode; HKD source is not compiled to native machine code. JIT dispatch and native-code AOT are not implemented.

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
- [Verification Scope](#verification-scope)
- [Security & Provenance](#security--provenance)
- [Contributing](#contributing)
- [License](#license)

---

## Why HKD?

HKD combines a statically typed language with a small compiler and runtime toolchain:

1. **Static typing**: Type checking, functions, structs, and generics are part of the compiler; some language features remain edition-gated or experimental.
2. **Two execution paths**: The TypeScript reference VM is included in the CLI. A native Zig bytecode runtime is available for supported builds.
3. **Integrated tooling**: The repository includes package management, linting, documentation, LSP, DAP, and a VS Code extension.
4. **Platform checks**: CI builds and executes the TypeScript CLI and Zig runtime on its configured runners. See the workflow for its current checks.

---

## Installation

Pre-built packages and a public npm installation are not currently provided. Build the CLI from source with Node.js 18 or newer and npm:

```bash
git clone https://github.com/HassanDev-git/HKD.git
cd HKD
npm ci
npm run build
node dist/cli/main.js --help
```

The TypeScript reference VM is available after the build. CI builds and tests the optional Zig runtime for its configured target runners.

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

HKD provides a command-line toolchain for compiling and running programs:

| Command | Description | Example |
|---|---|---|
| `hkd run <file>` | Run an HKD source file via the Stack VM | `hkd run src/main.hkd` |
| `hkd run <file> --reference` | Run using the reference AST interpreter | `hkd run src/main.hkd --reference` |
| `hkd build <file>` | Compile program to bytecode artifact (`.hkdb`) | `hkd build src/main.hkd` |
| `hkd build --verify-reproducible` | Verify bit-for-bit deterministic output parity | `hkd build src/main.hkd --verify-reproducible` |
| `hkd check <file>` | Validate syntax and type-check without emitting | `hkd check src/main.hkd` |
| `hkd test [dir]` | Run HKD source-level `*.test.hkd` programs | `hkd test examples/real-world/pkg-app/` |
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

The compiler translates HKD source into bytecode, which can run in either interpreter:

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
[Semantic Analysis] ──► Type Checking
       │
       ▼
 [Bytecode Emitter] ──► Bytecode V2 Chunk (.hkdb)
       │
       ├─────────────────────────┬─────────────────────────┐
       ▼                         ▼                         ▼
 [Reference VM]          [Native bytecode VM]
   (TypeScript)                 (Zig)
       │                         │
       └──── Standalone bytecode bundle ────┘
```

1. **Front end**: Lexing, parsing, semantic analysis, and type checking.
2. **Bytecode**: The compiler emits serialized HKDB chunks for the runtime pipeline.
3. **Interpreters**: The TypeScript reference VM and Zig runtime both interpret HKD bytecode.
4. **Standalone bundles**: The native launcher can carry embedded HKDB bytecode. It does not compile HKD source to machine code.
5. **JIT and AOT**: Experimental x86-64 emission code is not dispatched by the HKD VM. JIT execution and native-code AOT are unavailable.

---

## Platform Support Matrix

CI exercises the following host operating systems and architectures. A passing runner check is evidence for that workflow revision, not a claim about every distribution or deployment environment.

| Target Triple | Tier | Node.js | Support Level |
|---|---|---|---|
| Windows x64 | CI runner | 24 | Native runtime build and execution, CLI checks, standalone package build and smoke test |
| Windows ARM64 | CI runner | 24 | Zig tests run natively; ReleaseFast runtime is cross-built on Ubuntu x64 and executed on Windows ARM64; standalone package build and smoke test |
| Linux x64 | CI runner | 22 and 24 | Native runtime build and execution, CLI checks; standalone package build and smoke test on Node 24 |
| Linux ARM64 | CI runner | 24 | Native runtime build and execution, CLI checks, standalone package build and smoke test |
| macOS x64 | CI runner | 24 | Native runtime build and execution, CLI checks, standalone package build and smoke test |
| macOS ARM64 | CI runner | 24 | Native runtime build and execution, CLI checks, standalone package build and smoke test |
| WebAssembly / WASI | Deferred | — | No WASM runtime or release target is provided |

---

## Experimental Features & Transparency

In adherence to Rule 2 (*Zero Fake Features*), language capabilities under active RFC development are explicitly gated and documented:

- **RFC-003 Traits / Behavioral Contracts**:  
  Syntax `#feature(traits)` is recognized by the compiler front-end for specification validation. Runtime dynamic dispatch vtables and `impl` lowering are in active development and targeted for **HKD 1.2**.
- **RFC-004 Linear Async / Await**:  
  Some asynchronous library APIs exist, but language-level `async fn` / `await` compiler support is incomplete and remains experimental.

---

## Known Limitations

For complete operational boundaries, see [docs/known-limitations.md](docs/known-limitations.md):
- **Public Package Registry Server**: HKD does not operate a central public registry. The client supports local paths, `.hkdpack` archives, offline cache workflows, and configured registry endpoints.
- **FFI Struct Layouts**: Basic C ABI function calls are supported; complex packed struct serialization currently requires explicit byte marshalling.

---

## Verification Scope

Public CI runs lint, TypeScript typecheck and build, Zig runtime tests, CLI smoke checks, dependency diagnostics, and a container build/runtime check. The Jest regression suite and its fixtures are preserved in a local maintainer archive and are not included in this public checkout or run by public CI.

Run the host-scoped release verification probes after building:
```bash
node dist/cli/main.js verify-release
```
This command reports the current host's probes; it does not certify other platforms.

---

## Security & Provenance

HKD documents its security and provenance boundaries:
- **Build provenance design**: See [docs/signing-provenance.md](docs/signing-provenance.md); no SLSA level is claimed for this build.
- **CycloneDX 1.5 SBOM**: Automated Software Bill of Materials generation (`hkd verify-release`).
- **Secret scan**: CI checks tracked source and configuration files for credential patterns and machine-specific paths.
- **Reporting Vulnerabilities**: See [SECURITY.md](SECURITY.md) for private vulnerability disclosure channels.

---

## Contributing

We welcome community contributions to HKD!

1. Fork the repository and create a feature branch (`git checkout -b feature/my-feature`).
2. Run the public checks:
   ```bash
   npm ci
   npm run lint
   npm run typecheck
   npm run build
   npx ts-node scripts/secret-scan.ts
   node dist/cli/main.js --version
   ```
   Public CI also builds and executes the Zig runtime and CLI on its configured platform runners. The archived Jest suite is not part of this public repository.
3. Submit a pull request with a clear rationale and verification notes.

---

## License

HKD is open-source software licensed under the [MIT License](LICENSE).
