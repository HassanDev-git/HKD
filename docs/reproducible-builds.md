# HKD 1.0 Reproducible Build Certification & Determinism Architecture

## Overview

A core architectural invariant of the **HKD 1.0.0** programming language is **100% byte-for-byte bitwise reproducibility**.

Given the identical source tree, compiler version, target triple, and build profile, HKD produces bitwise-identical bytecode (`.hkdb`), release manifests (`artifact.json`), and standalone native binaries across any machine, operating system, or build environment.

---

## 1. Determinism Invariants

To eliminate all non-determinism vectors from the compilation and packaging pipeline, HKD enforces the following design invariants:

### 1.1 Source Path Normalization
- Host-specific absolute paths (e.g. `C:\Users\...` or `/home/user/...`) are strictly scrubbed from compiled debug symbols and bytecode chunks.
- Identifiers and filenames are mapped relative to the project manifest root (`hkd.toml`).

### 1.2 Constant Pool & Symbol Sorting
- Module tables, symbol lookup tables, and constant pools are serialized in lexicographical order.
- Hash map iteration is never exposed to bytecode emission; all dictionary and set structures are sorted deterministically prior to code generation.

### 1.3 Timestamp Isolation
- The bytecode header (`HKDB` V2 format) omits compilation timestamps.
- Metadata manifests (`artifact.json`) maintain a structured `SOURCE_DATE_EPOCH` standard, preventing build-time variation from causing divergence.

### 1.4 Native Standalone Boundary
- The standalone executable trailer format:
  ```
  [ Native Runtime Payload ]
  [ Bytecode Payload (.hkdb) ]
  [ 8-byte Length (LE uint64) ]
  [ Magic Marker "HKDSTAND" ]
  ```
  concatenates the pre-compiled, verified native runtime with the deterministic `.hkdb` payload, ensuring the resulting binary is bitwise reproducible.

---

## 2. Verification Protocol

The compiler provides an automated reproducibility verification tool:

```typescript
import { verifyBuildReproducibility } from "hkd/package-manager";

const result = verifyBuildReproducibility("src/main.hkd", "hkd");
console.log(result.reproducible); // true
console.log(result.hashA);        // sha256:...
console.log(result.hashB);        // sha256:... (identical)
```

### Empirical Test Evidence (HKD 1.0.0 Release Verification)

| Target | Source File | Run A (SHA-256) | Run B (SHA-256) | Bitwise Equivalence |
|---|---|---|---|---|
| `production-validation-app` | `production-validation-app/src/main.hkd` | `cdc62a0a6a3b6d6a...` | `cdc62a0a6a3b6d6a...` | **MATCH (100.0%)** |
| `production-server` | `examples/production-server/src/main.hkd` | `cbf8dff267361816...` | `cbf8dff267361816...` | **MATCH (100.0%)** |

Certified report recorded at `reports/reproducibility-final.json`.
