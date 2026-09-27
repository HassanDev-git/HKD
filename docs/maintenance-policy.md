# HKD 1.0.x Maintenance Policy & Branching Strategy

## Overview

This policy defines the governance, branch management, and stability contracts for **HKD 1.0.x** maintenance releases.

The guiding mandate of the 1.0.x series is **absolute predictability, zero breaking changes, and boring reliability**.

---

## 1. Branch Strategy

```text
  main (Development: next minor 1.1.0 / Edition 2027)
    │
    ├──> [Cherry-pick fixes]
    │           │
    ▼           ▼
  release/1.0 (Protected Maintenance Branch)
    │
    ├──> v1.0.0 (Tag - General Availability)
    ├──> v1.0.1 (Tag - Security & Bug Fixes)
    └──> v1.0.2 (Tag - Ongoing Maintenance)
```

- **`main`**: The primary branch for forward development, experimental enhancements, and candidates for HKD 1.1+.
- **`release/1.0`**: The protected maintenance branch for the 1.0.x release line. All changes merged to this branch must be non-breaking, backwards-compatible, and accompanied by automated regression tests.
- **`hotfix/1.0.x-<slug>`**: Short-lived patch branches branched from `release/1.0` and merged via pull request after passing all release acceptance gates.

---

## 2. Allowed vs Prohibited Changes in 1.0.x

### 2.1 Permitted in 1.0.x Patch Releases
- **Bug Fixes**: Correcting semantic analyzer bugs, optimizer edge-case miscompilations, parser error recovery, or runtime faults.
- **Security Patches**: Remediating vulnerabilities (e.g., path traversal, memory limits, deserialization defenses).
- **Crash & Panic Prevention**: Guarding unhandled null checks, stack depth limits, or memory exhaustion.
- **Memory & Resource Leak Fixes**: Eliminating leaked sockets, file descriptors, heap blocks, or process handles.
- **Compatibility-Preserving Optimizations**: Improving JIT/AOT performance or reducing GC pause times without changing observable semantics.
- **Tooling Reliability Fixes**: Improving LSP diagnostics, DAP stepping, formatter accuracy, or CLI doctor checks.
- **Documentation & Diagnostic Corrections**: Clarifying error messages, updating operational runbooks, fixing documentation typos.

### 2.2 Strictly Prohibited in 1.0.x (Requires Minor/Major Release)
- **Breaking Language Syntax**: Adding new keywords, altering operator precedence, or deprecating existing syntax.
- **Breaking Semantics**: Changing scoping rules, type coercion behaviors, or evaluation order.
- **Incompatible Bytecode Changes**: Altering the `.hkdb` binary header layout or changing existing opcode numeric values.
- **Incompatible ABI Changes**: Modifying calling conventions or runtime data layout structures.
- **Breaking Standard Library APIs**: Changing public function signatures, removing modules, or changing return types.
- **Breaking Package Format**: Modifying `.hkdpack` structure or `hkd.toml` schema in ways that break existing packages.
- **CLI Behavior Regressions**: Changing existing subcommands, removing flags, or altering canonical exit codes (0..5).
- **LSP / DAP Protocol Regressions**: Altering standard JSON-RPC capabilities in ways that break IDE clients.

---

## 3. Backporting & Release Sign-Off Protocol

Every patch candidate must complete this 5-stage pipeline before tagging:

1. **Reproduction**: Create a minimal reproducible test case verifying the defect in `release/1.0`.
2. **Root Cause Analysis & Fix**: Implement the fix with minimal surgical surface area.
3. **Permanent Regression Test**: Add a permanent test case in `tests/` or `tests/security/regression/`.
4. **Full Test Battery**: All test suites must pass (100% pass rate, 0 failures, 0 memory leaks).
5. **Release Verification**: Run `hkd verify-release` to confirm all 14 dimensions pass with 0 blockers and 0 warnings.
