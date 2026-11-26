# HKD 1.1.0 — High-Performance Toolchain & Developer Platform

Repository copy updated with the locally rebuilt Windows x64 recovery artifacts on 2026-10-24. No GitHub release or tag was changed.

We are proud to release **HKD 1.1.0** — featuring a dual-engine execution architecture (Reference Stack VM + High-Performance Register VM), optimizing compiler pipeline, Native Zig runtime parity, first-class structured concurrency, and a unified developer platform.

---

## What's New in HKD 1.1.0

### 1. Dual-Engine Architecture
- **Reference Stack VM (`VM_REFERENCE`)**: Retains complete semantic authority, ensuring 100% language spec fidelity, deterministic execution, and formal verification.
- **Register VM**: 3-address bytecode architecture delivering massive throughput improvements across arithmetic loops, recursion, and struct allocation.
- **Native Zig VM**: Zero-dependency standalone native runtime with full cross-platform parity.

### 2. Runtime Execution Specialization
- **Direct Dispatch**: Optimized `call1` and `call2` opcodes eliminating transient argument array allocations.
- **Call Frame Pooling**: Aggressively lowers recursion overhead by recycling execution frames.
- **Deterministic String Hashing**: FNV-1a fast-path hashing with interned string table reuse.

### 3. Windows Command-Line Executable
- The Windows x64 executable embeds the Node runtime and CLI bundle.
- It is a command-line tool: run it from PowerShell or Windows Terminal to keep output visible. With no arguments it prints help and exits.
- Regular `hkd run` commands use the included TypeScript VM when the companion native runtime is absent. `--jit` is explicitly unavailable in this release; other native VM flags need `hkd-runtime`.

### 4. Developer Experience & CLI Tooling
- **Granular Subcommand Help**: `hkd help <command>`, `hkd <command> --help`, and `hkd <command> -h` are fully supported for all 35+ commands with usage syntax, option flags, and real-world examples.
- **Intelligent Typo Suggestions**: Did-you-mean suggestions using Levenshtein distance for mistyped commands (e.g. `hkd biuld` -> suggests `hkd build`).
- **Clean Command Overview**: Commands are cleanly categorized into Getting Started, Build & Execution, Code Quality & Testing, Package Management, and Release & Diagnostics.

### 5. Ecosystem & Editor Foundation
- **LSP 2.0 & DAP Integration**: Out-of-the-box support for Language Server Protocol and Debug Adapter Protocol (`hkd lsp`, `hkd dap`).
- **Friend Developer Preview Guide**: Step-by-step 8-step onboarding walkthrough in [`docs/friend-developer-preview.md`](https://github.com/HassanDev-git/HKD/blob/main/docs/friend-developer-preview.md).
- **Developer Tooling Specification**: Formalized roadmap for TextMate and Tree-Sitter grammars in [`docs/developer-tooling.md`](https://github.com/HassanDev-git/HKD/blob/main/docs/developer-tooling.md).
- **Bug Reporting Template**: Standardized GitHub issue template for community feedback.

---

## Verification & Quality Gates

The 2026-11-20 local Windows x64 audit passed 120 Jest suites and 1,048 tests; TypeScript typechecking and 9 Zig runtime unit tests also passed. The rebuilt standalone executable passed version, help, valid/invalid program, clean-directory, and JIT-rejection checks. Its extracted ZIP passed version, help, valid/invalid program, different-directory, and missing-companion-runtime checks. These are host-local checks; no GitHub release was published.

The release verifier reports **HOST TARGET READY** for Windows x64 only. JIT execution and native machine-code AOT are explicitly not implemented and are outside the declared 1.1.0 release contract. Linux, macOS, ARM64, and a built/running container remain unverified. See the dated [Phase 10.3 verification report](../artifacts/phase10.3-final-release-verification.json), [benchmark report](../artifacts/phase10.3-benchmark-final.json), and [known limitations](known-limitations.md).

---

## Quick Start

### 1. Download & Verify
Download `hkd-v1.1.0-windows-x64.zip` or `hkd.exe` from the Assets below.

### 2. Check System Health
```powershell
hkd version
hkd doctor
```

### 3. Create Your First Project
```powershell
hkd init my-app
cd my-app
hkd check
hkd build --release
hkd run
hkd test
```

---

## SHA256 Checksums

```text
bd529a9f746283b5f85dc69e6782e35a7201f3c4b805112864be9aff71144b61  windows-x64/hkd.exe
f0eacf112b3993e6180dd63fc3cb669f455db0c65c4594bff1ca6134e30d39de  hkd-v1.1.0-windows-x64.zip
```
