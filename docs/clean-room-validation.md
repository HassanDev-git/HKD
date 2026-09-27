# HKD 1.0 Clean-Room Validation & Environment Independence Guide

## Overview

This specification certifies that the **HKD 1.0.0** programming language, toolchain, and runtime execute deterministically in clean-room environments without ambient dependencies, unpinned global modules, or external network reliance.

---

## 1. Clean-Room Architecture & Isolation Model

HKD's runtime and toolchain architecture enforces strict isolation boundaries:

1. **Self-Contained Executable & Runtime**:
   - Stack VM and compiler pipeline packaged into `hkd` (or `dist/cli/main.js` via Node 18+).
   - High-performance native runtime compiled into standalone native binary (`hkd-runtime.exe` / `hkd-runtime`).
   - Zero requirement for system-wide npm global packages or external C/C++ toolchains at runtime.

2. **Environment Variable Configuration**:
   - `HKD_HOME`: Base configuration directory (defaults to `~/.hkd`).
   - `HKD_CACHE_DIR`: Content-addressed package and artifact cache (defaults to `HKD_HOME/cache`).
   - `HKD_TARGET`: Target triple override for cross-compilation.
   - `HKD_PORT`: Default network server port.
   - `HKD_ENV`: `development` | `staging` | `production`.

3. **Deterministic Local State**:
   - All build artifacts reside strictly inside `target/` within the project root.
   - Local package caches and lockfiles reside inside `.hkd/` and `hkd.lock`.
   - Temporary test scratch files reside in OS temporary directories with unique namespaces and automatic cleanup.

---

## 2. Platform Tier Matrix

| Target Triple | OS | Architecture | Support Tier | Runtime Backend |
|---|---|---|---|---|
| `x86_64-windows` | Windows 10/11 / Server 2022 | x86_64 | **Tier 1 (Supported)** | Stack VM + Native Zig + JIT |
| `x86_64-linux` | Linux (glibc 2.31+ / musl) | x86_64 | **Tier 1 (Supported)** | Stack VM + Native Zig + JIT |
| `aarch64-macos` | macOS (Apple Silicon 12+) | ARM64 | **Tier 1 (Supported)** | Stack VM + Native Zig + JIT |
| `aarch64-linux` | Linux (kernel 5.4+) | ARM64 | **Tier 2 (Certified)** | Stack VM + Native Zig |
| `x86_64-macos` | macOS (Intel 10.15+) | x86_64 | **Tier 2 (Certified)** | Stack VM + Native Zig |

---

## 3. Clean-Room Verification Protocol (Step-by-Step)

In an isolated environment (such as a fresh VM, CI container, or clean directory):

### Step 1: Toolchain Validation & Health Check
```bash
hkd version
# Expected: HKD v1.0.0 (Edition 2026)

hkd doctor
# Expected: All checks OK (Node, Zig, Target, Cache, Permissions)
```

### Step 2: Project Initialization from Zero
```bash
mkdir clean-project && cd clean-project
hkd init . clean-project
# Creates: hkd.toml, src/main.hkd, tests/app.test.hkd, .gitignore
```

### Step 3: Static Analysis & Type Checking
```bash
hkd check
# Returns exit code 0; zero semantic or type errors.
```

### Step 4: Test Suite Execution
```bash
hkd test
# Discovers tests in tests/ directory and asserts correctness.
```

### Step 5: Incremental & Release Compilation
```bash
hkd build --release
# Emits optimized bytecode and native artifacts in target/releases/
```

### Step 6: Direct Execution
```bash
hkd run
# Executes application entrypoint; verifies stdout and exit code 0.
```

### Step 7: Supply-Chain Release Packaging
```bash
hkd release --target x86_64-windows
# Generates release bundle, artifact.json, SHA256SUMS, and CycloneDX 1.5 SBOM.
```

### Step 8: Cryptographic Verification
```bash
hkd verify-artifact target/releases/<bundle-dir>
# Verifies bitwise SHA-256 integrity against SHA256SUMS.
```

### Step 9: 14-Dimension Production Readiness Gate
```bash
hkd verify-release
# Runs all 14 gates; asserts 0 blocking issues and 0 warnings.
```

---

## 4. Offline Resilience Guarantee

HKD provides an unconditional offline contract:

```bash
hkd install --offline
```

- When `--offline` is specified, the dependency resolver and package loader **never** open TCP/HTTP sockets.
- Packages are resolved solely from local cache (`.hkd/cache`) or pinned path dependencies (`path:../`).
- If any package or checksum is missing from the local cache, the command terminates immediately with **Exit Code 3 (ConfigError)** or **Exit Code 4 (BuildError)**, emitting an actionable message instructing the operator on how to populate the cache.

---

## 5. Security & Isolation Invariants

1. **Filesystem Traversal Protection**:
   - The module resolver and package extraction engines reject paths escaping the project root (`../` traversal attacks).
2. **Decompression Bomb Defense**:
   - Archive expansion enforces maximum uncompressed byte ratio (100:1) and maximum file size (50 MB).
3. **Secret Masking Contract**:
   - Logs, CLI output (`hkd config`, `hkd doctor`), and crash dumps mask all tokens matching `TOKEN`, `KEY`, `PASSWORD`, and `SECRET` with `********`.
4. **Non-Root Execution**:
   - Production container specifications designate UID `10001` (`USER hkd:hkd`) with `no-new-privileges:true`.
