# HKD v1.1.0 — RFC-004 Async/Await, Futures & Structured Concurrency

We are thrilled to announce the official release of **HKD v1.1.0**, featuring full implementation of **RFC-004: Async/Await, Futures & Structured Concurrency**.

---

### Highlights in v1.1.0

#### 1. First-Class Async/Await Syntax
- `async fn` / `async` methods returning cooperative `Future<T>`.
- `await <expr>` keyword for non-blocking suspension and resumption.
- Static type checking for async returns, preventing unhandled future leaks.

#### 2. Structured Concurrency & Event Loop
- Cooperative scheduler integrated with the HKD runtime.
- Cancellation hierarchy with cooperative tokens.
- Concurrency combinators: `Future.all(...)` and `Future.race(...)`.

#### 3. Cross-Platform Parity & Multi-Tier Runtime
- Full parity across **Stack VM**, **Native Zig VM**, **JIT**, and **AOT compiler**.
- Differential verification with 105 test suites and 884 tests passing.
- 18/18 verification release gates cleared.
- Multi-platform continuous integration on Windows, Linux, and macOS.

#### 4. Tooling & Developer Experience
- LSP (Language Server Protocol) hover, diagnostics, and auto-completions for async signatures.
- DAP (Debug Adapter Protocol) call stack unwinding for async task frames.
- Formatter and linter support for async syntax.

---

### Installation & Quick Start

#### Standalone Binary (Windows x64)
Download `hkd-v1.1.0-windows-x64.zip`, extract `hkd.exe`, and add it to your PATH:
```powershell
hkd --version
hkd run main.hkd
```

#### Verification Checksums
```text
SHA256 (hkd-v1.1.0-windows-x64.zip):
ae3c09fda0b7d67337e67ef3fe9af85794037764c57ed9ee16126a7c0a5a14cb
```
