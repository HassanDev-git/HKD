# HKD Official Public Release Checklist

This document defines the mandatory, evidence-based checklist required before cutting and announcing any public release of HKD (including **HKD 1.1.0**).

---

## 1. Code Freeze & Repository Hygiene
- [ ] Working tree is clean with no uncommitted changes.
- [ ] TypeScript compilation succeeds with zero warnings/errors (`npm run build`).
- [ ] Strict type checking passes (`npx tsc --noEmit`).
- [ ] Secret sanitization passes with zero leaked tokens or unauthorized paths (`npx tsx scripts/secret-scan.ts`).
- [ ] Code formatting and linter checks pass cleanly (`npm run fmt && npm run lint`).

---

## 2. Test Suite & Verification Gates
- [ ] Automated test suite achieves 100% pass rate across all suites (`npm test`).
- [ ] Conformance tests pass across syntax, semantics, types, and control flow (`tests/conformance/`).
- [ ] Backward compatibility with Edition 2026 verified (`tests/compatibility/`).
- [ ] Bytecode safety and corrupted file recovery verified (`tests/bytecode/bytecode_safety.test.ts`).
- [ ] Package manager golden workflow verified (`tests/package/golden_workflow.test.ts`).
- [ ] Documentation examples compile and execute successfully (`tests/docs/doc_examples.test.ts`).
- [ ] Production reference service runs under load without socket leaks (`tests/examples/production_service.test.ts`).

---

## 3. Stability & Memory Soak Invariants
- [ ] 10,000-cycle soak memory stress test executes with zero unhandled leaks.
- [ ] Memory allocation ratio remains bounded (`rssGrowthRatio < 1.10x`).
- [ ] Garbage collection nursery/mature collection cycle boundaries validated.
- [ ] Memory instrumentation evidence recorded in `artifacts/release-verification.json`.

---

## 4. Security & Governance Invariants
- [ ] `SECURITY.md` contains active, verified reporting mechanisms (no synthetic SLAs).
- [ ] Threat model and security boundaries documented (`docs/threat-model.md`, `docs/security-boundaries.md`).
- [ ] Any `CRITICAL` or `HIGH` severity defects are treated as unconditional release blockers.
- [ ] Experimental features (RFC-003 Traits, RFC-004 Async) safely gated and documented in `docs/known-limitations.md`.

---

## 5. Performance Benchmarks Baseline
- [ ] Benchmark harness executed on reference host (`npx tsx benchmarks/measure-1.1.ts`).
- [ ] Host environment recorded in `benchmarks/results/system-environment.json`.
- [ ] Measured baselines recorded in `benchmarks/baseline-1.1.json`.
- [ ] Zero regressions exceeding allowable thresholds defined in `docs/performance-regression-policy.md`.

---

## 6. Version & Documentation Synchronization
- [ ] `package.json` version bumped to target release (e.g. `1.1.0`).
- [ ] `HKD_VERSION` constant updated in `src/utils/index.ts`.
- [ ] `CHANGELOG.md` updated with comprehensive release notes and migration instructions.
- [ ] Dedicated release notes created (`docs/release-1.1.0.md`).
- [ ] Project health scorecard created (`docs/project-health.md`).

---

## 7. Artifact Packaging & Cryptographic Integrity
- [ ] Production bundles built for all target architectures.
- [ ] SHA-256 digests computed and recorded in `dist/SHA256SUMS`.
- [ ] Authoritative release metadata generated in `dist/artifacts.json`.
- [ ] Release verification engine outputs `RESULT: RELEASE READY`:
  ```bash
  node dist/cli/main.js verify-release
  ```
- [ ] Machine-readable verification artifact exported to `artifacts/release-verification.json`.

---

## 8. Publication & Distribution
- [ ] GitHub Release created with signed tag (e.g. `v1.1.0`).
- [ ] Distribution archives and standalone executables uploaded.
- [ ] `dist/SHA256SUMS` and `dist/artifacts.json` attached as release assets.
- [ ] Package registry updated with latest compiler and standard library packages.
