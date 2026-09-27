# HKD Issue Pipeline & Regression-First Development Protocol

## Overview

To maintain enterprise-grade stability throughout the **HKD 1.0.x** lifecycle, all defects and security reports must follow a structured classification and regression-first resolution workflow.

---

## 1. Issue Categories

All issues are categorized under one of 19 functional domains:

| Category | Domain | Description |
|---|---|---|
| `COMPILER` | Pipeline & Codegen | Code generation, constant folding, compilation driver. |
| `PARSER` | Front-End Grammar | Concrete syntax tree, token streams, grammar parsing. |
| `SEMANTICS` | Type System | Type checker, symbol resolution, scope analysis. |
| `RUNTIME` | Core Runtime | Program initialization, thread models, signal handling. |
| `VM` | Stack Virtual Machine | Bytecode interpreter, frame stacks, instruction dispatch. |
| `JIT` | JIT Compilation | Baseline JIT, optimizing JIT, inline caches, machine code. |
| `AOT` | Ahead-Of-Time Native | Standalone native compilation, binary trailers, linker. |
| `STDLIB` | Standard Library | Built-in modules (`io`, `math`, `fs`, `sys`, `time`, `http`). |
| `PACKAGE` | Package Manager | SemVer resolver, lockfile generation, dependency graph. |
| `REGISTRY` | Package Registry | Package archives (`.hkdpack`), cache, content addressing. |
| `LSP` | Language Server | Autocomplete, hover, diagnostics, semantic tokens. |
| `DAP` | Debugger Adapter | Breakpoints, stepping, variable inspection, stack traces. |
| `VSCODE` | IDE Extension | Extension client, TextMate grammars, editor commands. |
| `NETWORK` | Sockets & HTTP | TCP clients, HTTP server, connection pooling. |
| `DEPLOYMENT` | Release Tooling | Build profiles, release artifacts, SHA256SUMS, SBOM. |
| `CONTAINER` | Docker & Virtualization | Multi-stage Dockerfile, unprivileged UID 10001 runtime. |
| `SECURITY` | Vulnerability & Hardening | Path traversal, buffer limits, secrets masking, CVEs. |
| `PERFORMANCE` | Speed & Memory | Latency regressions, throughput drops, memory leaks. |
| `DOCUMENTATION` | Docs & Specs | Language references, tutorials, API docs, runbooks. |

---

## 2. Severity Classification

- **`CRITICAL`**: Remote code execution, arbitrary file overwrite, security compromise, compiler crash on valid standard code, or silent miscompilation producing incorrect data.
- **`HIGH`**: Broken core package manager resolution, IDE language server crash, unbounded memory leak under steady load, or deployment artifact verification failure.
- **`MEDIUM`**: Edge-case compiler error reporting defect, non-blocking diagnostic formatting bug, missing type inference in complex ternary expression, or transient network retry failure.
- **`LOW`**: Cosmetic documentation typo, minor help text formatting glitch, or deprecation notice clarity.

---

## 3. Mandatory Bug Report & Triage Template

Every tracked issue must provide:

```markdown
### 1. Classification
- Category: [e.g. COMPILER | RUNTIME | SECURITY]
- Severity: [CRITICAL | HIGH | MEDIUM | LOW]

### 2. Environment
- HKD Version: [e.g. 1.0.0]
- Language Edition: [2026]
- Host OS & Architecture: [e.g. x86_64-windows | x86_64-linux]
- Runtime Target: [e.g. host | native | container]

### 3. Problem Description
- Summary: Brief description of the observed behavior.
- Expected Behavior: What should have occurred according to the specification.
- Actual Behavior: What actually occurred (including error codes, logs, crash dumps).

### 4. Minimal Reproducible Example (MRE)
```hkd
// Minimal .hkd snippet triggering the issue
```

### 5. Root Cause Analysis (RCA)
- Subsystem & File: [e.g. src/vm/vm.ts line 380]
- Technical Cause: Detailed explanation of the defect mechanism.

### 6. Remediation & Regression Test
- Fix Commit / PR: [e.g. PR #123]
- Added Regression Test: [e.g. tests/security/regression/issue_123.test.ts]
```

---

## 4. Regression-First Development Protocol

No bug is considered resolved until a permanent regression test is committed:

```text
Bug Discovered / Reported
          ↓
Create Minimal Reproduction (MRE)
          ↓
Diagnose Root Cause
          ↓
Write Failing Regression Test in tests/
          ↓
Apply Code Fix to Compiler / Runtime
          ↓
Assert Regression Test Passes
          ↓
Run Complete Test Battery (100% Pass Rate)
          ↓
Merge & Package Patch Release Candidate
```
