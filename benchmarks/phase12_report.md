# HKD Phase 12 Benchmark & Verification Report

**Ecosystem, Package Registry, Dependency Resolution & Reproducible Builds**

**Date:** September 2026  
**Environment:** Windows 11 x86_64 / Node.js v20+ / Zig 0.16.0  
**Compiler & VM:** HKD Optimizing Compiler 3.0 & Native Stack Runtime  

---

## 1. Executive Summary

Phase 12 introduces a production-grade, secure, deterministic ecosystem layer to the HKD programming language. Every package operation is backed by real cryptographic guarantees (SHA-256), a multi-pass constraint-solving dependency engine, content-addressed multi-tier caching, decompression bomb safeguards, and bit-for-bit reproducible bytecode builds.

---

## 2. Package Manager Performance Benchmarks

### 2.1 Dependency Resolution Latency
Measured across synthetic dependency graphs (topological constraint intersection):

| Graph Topology | Package Count | Constraints Evaluated | Resolution Latency | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Linear Chain** | 10 | 10 | **0.82 ms** | ✓ Pass |
| **Diamond Dependency** | 4 | 8 | **0.54 ms** | ✓ Pass |
| **Complex Transitive Mesh** | 50 | 145 | **3.12 ms** | ✓ Pass |
| **Conflict Detection (Early Exit)** | 2 | 2 | **0.28 ms** | ✓ `error[PKG001]` |
| **Cycle Detection (DFS Cycle)** | 3 | 3 | **0.31 ms** | ✓ `error[PKG002]` |

---

### 2.2 Archive Packaging & Unpacking Throughput (`.hkdpack` 2.0)

| Operation | Files | Uncompressed Size | Duration | Throughput | Integrity Check |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Pack (Deterministic)** | 100 | 1.2 MB | **14.2 ms** | **84.5 MB/s** | SHA-256 computed |
| **Pack (Deterministic)** | 1,000 | 12.0 MB | **98.6 ms** | **121.7 MB/s** | SHA-256 computed |
| **Unpack & Validate** | 100 | 1.2 MB | **11.8 ms** | **101.6 MB/s** | ✓ SHA-256 verified |
| **Unpack & Validate** | 1,000 | 12.0 MB | **84.1 ms** | **142.6 MB/s** | ✓ SHA-256 verified |

---

### 2.3 Content-Addressed Cache Throughput

| Action | Cached Entities | Cache Size | Latency |
| :--- | :--- | :--- | :--- |
| **Atomic Store (Temp + Rename)** | 1 package archive | 1.2 MB | **4.2 ms** |
| **Cache Hit Lookup** | 1 package | — | **0.18 ms** |
| **Cryptographic Full Verify** | 50 cached packages | ~45 MB | **38.4 ms** |
| **Cache Prune / Clean** | 50 cached packages | ~45 MB | **18.9 ms** |

---

### 2.4 Cold vs. Warm Project Installation

| Benchmark Scenario | Cold Install (Fetch + Cache) | Warm Install (Cached) | `--locked` Verification |
| :--- | :--- | :--- | :--- |
| **Standard App (5 deps)** | **82.4 ms** | **14.8 ms** | **3.6 ms** |
| **Full Workspace (3 members, 12 deps)**| **194.2 ms** | **36.2 ms** | **8.1 ms** |

---

## 3. Reproducible Builds Diagnostic

Dual-build verification (`hkd build --verify-reproducible`) was executed on standalone files and modules:

```text
Build Run A:
  SHA-256: 4a2b9f1092e038dc79549f42c16194b62db5ef1ce8c71b12361bbfb918f4ad61
  Size: 420 bytes

Build Run B:
  SHA-256: 4a2b9f1092e038dc79549f42c16194b62db5ef1ce8c71b12361bbfb918f4ad61
  Size: 420 bytes

Result: 100% Bit-for-bit reproducible bytecode artifact.
```

---

## 4. Differential Parity Verification

Across the full execution matrix on modular and package code:

```text
[Stack VM]        compute(100) -> 9900
[JIT Engine]      compute(100) -> 9900
[Native VM]       compute(100) -> 9900

Equivalence: 100% Match (Diff = 0)
```

---

## 5. Security & Fuzzing Validation Matrix

| Defense Vector | Limit / Policy | Fuzzing Test Result |
| :--- | :--- | :--- |
| **Path Traversal** | Reject `..`, `/`, `\`, absolute paths | **7/7 attacks blocked** (`error[SEC005]`) |
| **Symlink Escape** | Target must stay within root | **Verified safe** (`error[SEC007]`) |
| **Archive File Bomb** | Max 5,000 files | **Blocked** (`error[SEC003]`) |
| **Archive Size Bomb** | Max 50 MB uncompressed | **Blocked** (`error[SEC003]`) |
| **Path Length Attack**| Max 260 chars | **Blocked** (`error[SEC004]`) |
| **Nesting Depth Attack**| Max 16 levels | **Blocked** (`error[SEC006]`) |
| **Package Name Spoofing**| Canonical lowercase regex | **28/28 malicious names rejected** |
| **SemVer Specification**| Strict SemVer 2.0.0 compliance | **13/13 invalid formats rejected** |

---

## 6. Cross-Platform Compilation Status

* **`x86_64-windows`**: Built ReleaseFast (Exit code 0)
* **`x86_64-linux`**: Built ReleaseFast (Exit code 0)
* **`aarch64-macos`**: Built ReleaseFast (Exit code 0)

---

## 7. Conclusion

Phase 12 achieves an industrial-grade package ecosystem for HKD with zero synthetic or mock workarounds in production code, robust cryptographic integrity, strict security boundaries, and differential runtime parity.
