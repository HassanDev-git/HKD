# HKD Language Roadmap

This document outlines the strategic evolution and release cadence for the HKD programming language.

---

## 1. Current Phase: HKD 1.0.x Maintenance (Edition 2026)

The primary goal of the 1.0.x series is **uncompromising operational stability and adoption**.

### Commitments
* **Zero Breaking Changes**: Full backwards compatibility across syntax, semantics, ABI, bytecode, and CLI exit codes.
* **Regression-First Fixes**: Automated reproduction tests for all reported bugs before patches merge.
* **Performance Baseline Lock**: Maximum allowable regression bounded at `< 5.0%`.
* **Security & Vulnerability Audits**: Continuous fuzzing and automated CVE/advisory triage.

---

## 2. HKD 1.1.0 Feature Horizon (RFC-Driven)

Non-breaking feature additions planned for HKD 1.1.0 include:

* **Pattern Matching RFC**: Expressive pattern matching syntax (`match val { ... }`) with exhaustiveness checking.
* **Expanded Async Primitives**: Async/await task orchestration and native thread pools in stdlib.
* **Enhanced WebAssembly Target**: Direct emission of `.wasm` modules from native AOT backend.
* **Package Registry Protocol V2**: Granular scope tokens, organization namespaces, and automated vulnerability webhooks.

---

## 3. Future Edition Planning: Edition 2027

To evolve the language without fragmenting existing codebases, HKD uses an **Edition System**.
* Code written with `edition = "2026"` will continue to compile and run unchanged indefinitely.
* Breaking grammar cleanups or syntactic overhauls will only take effect when a project opts into `edition = "2027"`.
* Projects of different editions will link and interoperate seamlessly within the same runtime.
