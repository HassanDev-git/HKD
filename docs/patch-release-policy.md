# HKD 1.0.x Patch Release & Stability Policy

## Overview

This policy governs all patch releases (`1.0.x`) of the **HKD** programming language following the 1.0.0 General Availability release.

The core guiding principle is **absolute stability and zero breaking changes**.

---

## 1. Scope of 1.0.x Patch Releases

### 1.1 Permitted in Patch Releases
- **Critical Security Fixes**: Vulnerability patches, buffer limit enforcements, deserialization hardening.
- **Bug Fixes**: Rectifying compiler crashes, optimizer miscompilations, VM errors, or type checker false positives.
- **Performance Optimizations**: Non-breaking JIT optimizations, GC efficiency enhancements, or memory reduction.
- **Documentation & Tooling Diagnostics**: Improving CLI diagnostic messages (`hkd doctor`, `hkd check`) without changing command arguments.

### 1.2 Prohibited in Patch Releases
- **New Language Keywords or Syntax**: Any syntax addition is reserved for future language editions or minor releases (`1.1.0`).
- **Standard Library Breaking Changes**: Altering function signatures, removing modules, or changing return types.
- **Bytecode ABI Incompatibilities**: The `.hkdb` binary format header, magic bytes, and existing opcode values are frozen.
- **Package Manifest Breaking Changes**: Alterations to `hkd.toml` schema requiring manual migration.

---

## 2. Patch Release Lifecycle

```
[Issue Identified] ──> [Triage & Security Classification] ──> [Fix in main / cherry-pick to release/1.0.x]
                                                                      │
[Full 14-Dimension Verification Gate (`hkd verify-release`)] <────────┘
        │
        ▼
[Pass: Tag v1.0.x] ──> [Reproducible Dual-Build Artifacts] ──> [CycloneDX 1.5 SBOM] ──> [Publish]
```

### Step 1: Branch Management
- Patch fixes are branched from `release/1.0.x` or cherry-picked from `main`.
- Branch naming convention: `hotfix/1.0.x-<issue-description>`.

### Step 2: Verification Checklist
Before any patch release tag is pushed, the release candidate must pass:
1. `npx jest`: 100% test suites passing with 0 failing and 0 skipped.
2. `hkd verify-release`: All 14 dimensions classified as `PASS` (0 blockers, 0 non-blocking warnings).
3. `hkd test --differential`: Bitwise equivalence confirmed across Stack VM and Native Zig runtime.
4. `verifyBuildReproducibility`: 100% byte-for-byte reproducibility confirmed.

---

## 3. Versioning & Deprecation Schedule

- HKD adheres strictly to **SemVer 2.0**:
  - `1.0.0` → Initial production release (Edition 2026).
  - `1.0.1` → Bug and security patch.
  - `1.1.0` → Backwards-compatible feature addition.
  - `2.0.0` → Major release (requires minimum 12-month deprecation warning).
- Deprecated APIs remain fully operational for at least one minor release cycle, emitting compiler warnings before removal.
