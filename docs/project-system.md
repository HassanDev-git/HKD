# HKD Build System & Compilation Cache Specification

This document details the build layout, compiler cache mechanics, and invalidation rules.

---

## 1. Project Directory Layout

When running `hkd build` on a project, the following output structure is generated:

```text
my-project/
├── hkd.toml
├── src/
│   └── main.hkd
├── target/
│   ├── debug/                  # Output directory for debug compilation mode
│   │   └── src/
│   │       └── main.hkdb       # Compiled entrypoint module bytecode
│   ├── release/                # Output directory for release compilation mode
│   └── build-manifest.json     # Cache manifest recording compiler/file state
```

---

## 2. Invalidation Rules

To guarantee build correctness and avoid running stale code, the compilation cache is invalidated under any of the following conditions:

1. **Source Hash Mismatch**: The SHA-256 hash of a file's content differs from the entry in `build-manifest.json`.
2. **Missing Output File**: The target `.hkdb` bytecode file does not exist on disk.
3. **Compiler Version Mismatch**: The compiler version used to generate the cache differs from `HKD_VERSION`.
4. **Edition Mismatch**: The project's language `edition` declared in `hkd.toml` is modified.
5. **Mode Mismatch**: The user builds with a different optimization flag (`--release` vs default `--debug`).
