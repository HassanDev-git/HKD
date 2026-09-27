# HKD Threat Model & Security Analysis

**Target Scope**: HKD 1.1.0 Ecosystem (Compiler, Virtual Machine, Native Runtime, Tooling, Packaging)  
**Security Standard**: Project-Scope Production Readiness Validation  

---

## 1. Asset & Trust Inventory

| Asset | Description | Sensitivity | Trust Level |
| :--- | :--- | :--- | :--- |
| **Source Code (`.hkd`)** | User-authored or untrusted third-party code | High (Execution target) | Untrusted |
| **Bytecode (`.hkdb`)** | Compiled binary bytecode | High (Execution stream) | Semi-trusted (Validated) |
| **Package Archives (`.hkdpack`)** | Compressed `.tar.gz` package payloads | High (Filesystem target) | Semi-trusted (Checksum-verified) |
| **Lockfile (`hkd.lock`)** | Dependency tree with SHA256 hashes | High (Supply chain integrity)| High integrity |
| **Host System** | Filesystem, environment, sockets, child processes | Critical | Boundary to protect |

---

## 2. Threat Scenarios & Mitigations

### 2.1 Malformed / Malicious Bytecode Injection
- **Threat**: Attackers supply crafted `.hkdb` files with out-of-bounds constant indices, invalid opcodes, or corrupted lengths to induce crashes or arbitrary memory writes.
- **Mitigation**:
  - `src/bytecode/serializer.ts` validates the 8-byte header (`HKDB` magic and format version 1) and enforces strict buffer bounds checking on every record.
  - Stack VM verifies stack boundaries on every push/pop and validates local slots on call frame activation.
  - Fuzz-tested in `tests/bytecode/bytecode_safety.test.ts` and `tests/runtime/corruption.test.ts`.

### 2.2 Package Archive Path Traversal (Zip Slip)
- **Threat**: A compromised package archive contains relative path entries like `../../etc/passwd` or `..\Windows\System32` to overwrite arbitrary system files upon extraction.
- **Mitigation**:
  - `src/package-manager/archive.ts` strictly sanitizes and validates destination paths using canonical directory resolution (`path.resolve`). Any entry resolving outside the target directory is rejected with an explicit error.
  - Tested in `tests/deploy/artifact_attack.test.ts`.

### 2.3 Dependency Tampering & Supply Chain Attacks
- **Threat**: Malicious actor alters package contents on a registry or mirror without updating package version.
- **Mitigation**:
  - Lockfile V2 (`hkd.lock`) records SHA256 digests for all package tarballs.
  - The package manager re-computes and verifies the cryptographic hash before extraction into cache. Checksum mismatches immediately abort installation.

### 2.4 Denial of Service via Parser Fuzzing
- **Threat**: Deeply nested expressions or huge inputs designed to cause call stack overflow in recursive descent parser.
- **Mitigation**:
  - Top-down operator precedence (Pratt parsing) for expressions minimizes call recursion.
  - Synchronization tokens permit fast recovery from syntax errors without unbounded loops.

### 2.5 Secret & Credential Leakage
- **Threat**: Passwords, API tokens, or local environment paths exposed in logs, crash dumps, or error reports.
- **Mitigation**:
  - Structured logger masks known secret keys (`token`, `password`, `key`, `secret`).
  - Automated secret scanner (`scripts/secret-scan.ts`) blocks releases containing hardcoded credentials or local paths.
