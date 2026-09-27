# HKD Package Architecture & Ecosystem Specification

This document details the architectural foundation of the HKD package management subsystem, dependency resolver, registry protocol, and build reproducibility model.

---

## 1. Core Principles

The package ecosystem for HKD is designed around five non-negotiable guarantees:

1. **Deterministic Resolution**: Given an identical `hkd.toml`, `hkd.lock`, and environment, dependency resolution yields an identical, bit-for-bit dependency graph regardless of network timing, filesystem iteration order, or operating platform.
2. **Content-Addressed Immutability**: Packages, cached archives, and native build artifacts are addressed strictly by cryptographically secure digests (`SHA-256`). A package version once published cannot be overwritten or modified.
3. **Zero Lifecycle Script Execution**: Package installation **never** executes arbitrary shell commands or build hooks. Compilation and execution are strictly segregated from dependency fetching and extraction.
4. **Offline Resilience**: Cached packages and locked dependency trees can be installed and verified without network connectivity (`--offline` / `HKD_OFFLINE=1`).
5. **Rigorous Security Boundaries**: All untrusted package inputs (archives, metadata, registry responses) are validated against path traversal, symlink escapes, archive decompression bombs, and dependency confusion.

---

## 2. Package Lifecycle

```text
┌─────────────────────────────────────────────────────────────┐
│                      Development                            │
│  `hkd init` → `src/main.hkd` + `hkd.toml`                   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Dependency Management                     │
│  `hkd add <pkg>@<range>` → Resolver 2.0                     │
│  `hkd remove <pkg>`      → Transitive pruning               │
│  `hkd install`           → Lockfile V2 verification         │
│  `hkd update`            → Range-bounded upgrade            │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Packaging & Publishing                    │
│  `hkd pack`    → Deterministic `.hkdpack` archive           │
│  `hkd publish` → Validation + SHA-256 + Registry Upload     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Consumption & Build                      │
│  Content Store → `.hkd/deps/` or `vendor/`                  │
│  Module Loader → Tree Shake & Incremental Compilation       │
│  Native AOT / JIT → Verified with Dependency Hash           │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Package Identity & Naming

Every package in HKD possesses a canonical identity:
```typescript
interface PackageIdentity {
  name: string;        // Normalized: [a-z0-9_-], 1-64 chars
  version: string;     // Strict SemVer 2.0.0
  source: string;      // "registry", "path:<rel>", "git:<url>"
  integrity: string;   // "sha256:<hex_digest>"
}
```

### Validation & Normalization Rules:
* Lowercase alphanumeric characters, hyphens (`-`), and underscores (`_`).
* Must begin and end with an alphanumeric character.
* Length restricted between 1 and 64 ASCII bytes.
* Disallowed characters: `/`, `\`, `:`, `~`, control characters, non-ASCII Unicode.
* Reserved identifiers: `hkd`, `std`, `core`, `builtin`, `main`, and Windows reserved names (`con`, `prn`, `aux`, `nul`, `com1`..`com9`, `lpt1`..`lpt9`).

---

## 4. Semantic Versioning Engine

HKD implements strict Semantic Versioning adhering to SemVer 2.0.0:

* **Exact**: `1.2.3`
* **Caret (`^`)**: Compatible with minor/patch updates without breaking major version (`^1.2.3` allows `>=1.2.3 <2.0.0`; `^0.2.3` allows `>=0.2.3 <0.3.0`).
* **Tilde (`~`)**: Compatible with patch updates only (`~1.2.3` allows `>=1.2.3 <1.3.0`).
* **Relational Ranges**: `>`, `>=`, `<`, `<=`, e.g. `>=1.0.0 <2.5.0`.
* **Wildcards**: `1.x`, `1.2.*`, `*`.
* **Prereleases**: `1.0.0-alpha.1`, `2.0.0-rc.2`.

---

## 5. Dependency Resolution Algorithm

The HKD Dependency Resolver 2.0 follows a deterministic constraint satisfaction algorithm:
1. **Input Normalization**: Sort root manifest dependencies alphabetically.
2. **Topological Traversal**: Traverse transitive dependencies breadth-first with deterministic sibling ordering.
3. **Constraint Intersection**: For each package, calculate the intersection of all declared version constraints from dependent packages.
4. **Highest Compatible Selection**: Select the highest available package version satisfying the intersected range.
5. **Conflict Reporting**: If no version satisfies all incoming constraints, raise structured error `error[PKG001]` reporting the conflicting dependency paths.
6. **Cycle Detection**: Identify cyclical dependencies across the dependency graph and raise `error[PKG002]`.

---

## 6. Lockfile V2 Specification (`hkd.lock`)

The lockfile records the exact resolved state in TOML format:

```toml
# This file is automatically generated by HKD. Do not edit manually.
version = 2
resolver = "2.0"

[[package]]
name = "buffer"
version = "1.2.0"
source = "registry"
checksum = "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

[[package]]
name = "http"
version = "2.1.0"
source = "registry"
checksum = "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
dependencies = [
    "buffer 1.2.0",
]
```

### V1 Migration:
When an existing JSON-based `hkd.lock` (V1) is detected, the package manager parses its package array, recalculates cryptographic SHA-256 checksums if missing, and rewrites the file as Lockfile V2, preserving dependency versions exactly.

---

## 7. Package Format 2.0 (`.hkdpack`)

`.hkdpack` archives are deterministic binary containers structured as follows:

```text
Offset    Length    Content
0         8         Magic Header: "HKDPACK2"
8         4         Manifest Length (big-endian u32)
12        N         Manifest JSON (UTF-8, sorted keys)
12+N      4         File Count (big-endian u32)
Followed by sorted file entries:
  4 bytes: Relative path length (u32-BE)
  M bytes: Relative path string (UTF-8, forward-slashes only)
  4 bytes: File content length (u32-BE)
  L bytes: Uncompressed file bytes
```

### Reproducibility Rules:
- Files are sorted lexicographically by relative path before serializing.
- All file paths use POSIX forward slash (`/`).
- File timestamps, ownership metadata (UID/GID), and file permissions are omitted.
- Output archives are bit-for-bit identical given identical file trees.

---

## 8. Content-Addressed Cache Hierarchy

Cache files are stored under `~/.hkd/cache/` (or `.hkd/cache/` in project-local mode):

```text
~/.hkd/cache/
├── packages/
│   └── <sha256>/
│       ├── package.hkdpack
│       └── unpacked/
├── metadata/
│   └── <sha256>.json
└── native/
    └── <sha256>.bin
```

---

## 9. Security & Hardening Boundaries

| Threat Vector | Mitigation Strategy |
| :--- | :--- |
| **Path Traversal** | Normalized relative path validation; ensure `path.resolve(dest, rel).startsWith(dest)`. |
| **Symlink Escape** | Prohibit symlinks that point outside package installation root; reject symlinks pointing to absolute paths. |
| **Archive Bombs** | Cap max extracted files (5,000), max total uncompressed size (50 MB), max nesting depth (16 levels). |
| **Dependency Confusion** | Explicit source pinning; local path packages and registry packages are never conflated. |
| **Tampering** | Checksums verified before writing to disk; mismatches abort installation. |
| **Arbitrary Code Execution** | No automated install-time script execution. |

---

## 10. Reproducible Builds

An HKD build is provably reproducible when the compiled output hash depends strictly on:
$$\text{BuildHash} = H(\text{SourceFiles} \parallel \text{LockfileHash} \parallel \text{CompilerVersion} \parallel \text{OptLevel} \parallel \text{TargetTriple})$$

The `hkd build --verify-reproducible` diagnostic performs dual independent compiles and verifies SHA-256 equivalence.
