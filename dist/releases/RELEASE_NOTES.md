# HKD v1.1.0 — RFC-004 Async/Await, Futures & Developer Ecosystem

We are proud to present **HKD v1.1.0**, delivering the complete implementation of **RFC-004: Async/Await, Futures & Structured Concurrency** alongside the **Phase 7 Developer Ecosystem & Production Readiness** suite.

---

### Direct Download & Installation

#### Windows x64 Standalone Executable
- **Direct Download**: [hkd-v1.1.0-windows-x64.zip](https://github.com/HassanDev-git/HKD/releases/download/v1.1.0/hkd-v1.1.0-windows-x64.zip)
- **Archive Size**: ~34 MB (decompresses to standalone ~90 MB `hkd.exe` with zero external dependencies)
- **SHA-256 Checksum**:
  ```text
  d551ebff61afe2be7dacd83eae919eefdd8fcdb41a98031f211d7f421424fdff
  ```

#### Quick Start
Extract `hkd.exe` and add it to your system PATH:
```powershell
# Verify installation
hkd version
hkd doctor

# Initialize and run a new project
hkd init my-app
cd my-app
hkd run
hkd test
```

---

### What's New in HKD v1.1.0

#### 1. First-Class Async/Await & Structured Concurrency (RFC-004)
- **`async fn` Syntax**: Functions declared with `async fn` return cooperative `Future<T>`.
- **`await` Operator**: Non-blocking suspension and resumption with deterministic state-machine lowering.
- **Task Primitives**: `task.sleep()`, `task.spawn()`, `task.all()`, and `task.race()`.
- **Cancellation Hierarchy**: Cooperative cancellation tokens with clean resource unwinding.
- **Edition 2027 Gating**: Smooth opt-in via `edition = "2027"` in `hkd.toml` or `#feature(async)` file-level directives.

#### 2. Phase 7 Complete Developer Ecosystem
- **Zero-Friction Golden Path**:
  - `hkd init`: Generates standard project layout with manifest and tests.
  - `hkd fmt`: Formats all `.hkd` files in project recursively (supports `--check` for CI).
  - `hkd check`: Performs zero-overhead static type validation on project entrypoints.
  - `hkd tree`: Visualizes resolved dependency hierarchy with Unicode tree rendering and `--json` export.
- **Advanced Package Management**:
  - Local monorepo path dependencies: `hkd add --path ../my-lib` with deterministic `hkd.lock` source pinning.
  - Hermetic `.hkdpack` archives: Cryptographically sealed with SHA-256 integrity, path-traversal rejection, and decompression bomb protection.
  - Offline vendoring: `hkd vendor` and `hkd install --offline`.
  - Continuous integration mode: `hkd install --locked` aborts if lockfile does not match manifest.
- **Tooling & IDE Readiness**:
  - **LSP 2.0**: Diagnostics, hover signatures, completions, go-to-definition, and rename.
  - **DAP 2.0**: Breakpoint debugging, step-in/step-out, variable inspection, and async frame unwinding.
  - **REPL**: Interactive exploration in Edition 2026 and 2027.
  - **`hkd explain <error_code>`**: Deep explanations and fix recommendations for compiler errors.

#### 3. Enterprise Quality & Verification Gates
- **107 Test Suites / 923 Tests Passing**: 100% pass rate across compiler, VM, runtime, LSP, DAP, and package ecosystem.
- **Zero Regressions**: All Phase 1 through 6.5 language and runtime features preserved with bit-for-bit parity.
- **Clean-Room Verified**: Automated clean-room verification in isolated workspaces.

---

### Documentation
- [Getting Started Guide](https://github.com/HassanDev-git/HKD/blob/main/docs/getting-started.md)
- [CLI Reference Manual](https://github.com/HassanDev-git/HKD/blob/main/docs/cli-reference.md)
- [Package Manager Guide](https://github.com/HassanDev-git/HKD/blob/main/docs/package-guide.md)
- [Debugging Guide](https://github.com/HassanDev-git/HKD/blob/main/docs/debugging-guide.md)
- [Code of Conduct](https://github.com/HassanDev-git/HKD/blob/main/CODE_OF_CONDUCT.md)
