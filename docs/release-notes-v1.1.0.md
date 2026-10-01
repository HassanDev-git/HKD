# HKD 1.1.0 — High-Performance Toolchain & Developer Platform

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

### 3. Windows Executable Experience (Phase 10 Hardened)
- **Zero-Flash Double Click**: Resolved the Windows Explorer console flash issue. Double-clicking `hkd.exe` now displays an informative welcome banner with guidance on opening PowerShell/Terminal and holds the window open until Enter is pressed.
- **Terminal Transparency**: Running `hkd` from any terminal continues to execute with zero delay.

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

- **Test Suites**: **120 / 120 PASS**
- **Unit & Conformance Tests**: **1,043 / 1,043 PASS**
- **TypeScript Typecheck**: **0 Errors** (`tsc --noEmit` clean)
- **Differential Parity**: **100%** (Stack VM ↔ Register VM ↔ Native Zig VM)
- **Release Verification**: **18 / 18 Quality Gates PASS** (`hkd verify-release`)
- **Reproducibility**: **100% Bit-for-Bit Deterministic**

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
97bf28d810e91818243d8e2304a58188f339ab7615d78ca5eb4ccf6bb1cff142  windows-x64/hkd.exe
e948ff9818757dc8a9b0f3d99b90d418f88c854aeb1bfe2dd2e36a66545acb8f  hkd-v1.1.0-windows-x64.zip
```
