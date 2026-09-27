# HKD Vulnerability Handling & Disclosure Policy

## 1. Security Principles
- **Defense-in-depth**: Security boundaries are reinforced at the parser, bytecode verifier, JIT code generator, and OS interaction layers.
- **Zero-Trust Packaging**: All third-party packages must be locked by SHA-256 digest and audited for known vulnerabilities.
- **No Implicit Privilege**: HKD programs run with minimum necessary privileges. Container specifications enforce non-root execution.

---

## 2. Severity Classification
- **Critical**: Remote Code Execution (RCE), arbitrary file write, memory safety bypass in native runtime.
- **High**: Denial of Service (DoS) crashing the runtime, authentication token leakage.
- **Medium**: High-resource consumption, local path disclosure.
- **Low**: Minor diagnostic anomalies without operational impact.
