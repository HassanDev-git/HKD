# Contributing to HKD

Thank you for your interest in contributing to the HKD programming language and developer platform!

HKD is governed under a strict **Zero Breaking Changes Contract** for stable editions and an evidence-based **Project-Scope Production Readiness Validation** framework.

---

## 1. Ground Rules & Evolution Principles

* **Zero Breaking Changes**: Any change to stable syntax, standard library signatures, bytecode ISA, or CLI exit codes must preserve 100% backward compatibility for Edition 2026.
* **Regression-First Engineering**: Every bug report and bugfix pull request must include an automated minimal reproducible example (MRE) that fails prior to the change and passes after.
* **Feature Classification & Honesty**: All language features must be honestly classified (`IMPLEMENTED`, `PARTIALLY_IMPLEMENTED`, `EXPECTED EXPERIMENTAL`, or `UNSUPPORTED`). No placeholder or fake implementations are permitted.
* **Strict Blocker Governance**: Any `CRITICAL` or `HIGH` runtime defect or security vulnerability is an absolute release blocker. No automated or unilateral AI waivers may be issued. Only human maintainers can evaluate documented waivers.
* **No Synthetic SLAs**: Documentation and security disclosures must reflect actual repository mechanisms without inventing synthetic SLA guarantees.

---

## 2. Development Setup

### Prerequisites
* **Node.js**: v18+ (tested on Node v24.19.0)
* **npm**: v9+ (tested on v11.17.0)
* **TypeScript**: v5+ (bundled in `devDependencies`)
* **Zig** (Optional, for native runtime compilation): v0.13.0

### Initial Setup
```bash
# Clone the repository
git clone https://github.com/hkd-lang/hkd.git
cd hkd

# Install dependencies
npm install

# Compile the TypeScript compiler and CLI tooling
npm run build
```

---

## 3. Tooling, Linting & Code Quality

Before opening a pull request, run the following quality checks:

```bash
# Type check without emitting files
npx tsc --noEmit

# Format codebase
npm run fmt

# Lint source code
npm run lint

# Secret and credential hygiene scan
npx tsx scripts/secret-scan.ts
```

---

## 4. Test Suite Execution

HKD requires a 100% pass rate across all automated test suites.

```bash
# Run all unit, integration, and conformance tests
npm test

# Run specific subsystem suites
npx jest tests/stdlib/iterators_collections.test.ts
npx jest tests/compatibility/
npx jest tests/package/golden_workflow.test.ts
npx jest tests/examples/production_service.test.ts
npx jest tests/docs/doc_examples.test.ts

# Execute full 14-dimension release acceptance verification
node dist/cli/main.js verify-release
```

---

## 5. RFC Process for Language Evolution

All non-trivial changes, syntax modifications, and major subsystem evolutions must undergo the **Request for Comments (RFC)** process.

### RFC Lifecycle:
1. **Draft**: Fork the repo and create a new RFC document under `rfcs/rfc-NNN-<title>.md` based on `rfcs/TEMPLATE.md`.
2. **Review**: Open a Pull Request with the label `rfc-proposal`. The community and maintainers discuss trade-offs, grammar implications, and implementation complexity.
3. **Accepted**: Maintainers accept the RFC. Implementation begins behind a `#feature(...)` gate if experimental.
4. **Active RFCs in HKD 1.1**:
   - `RFC-001: Generics & Polymorphic Types` (Status: **Accepted / Stable**)
   - `RFC-002: Pattern Matching & Exhaustiveness` (Status: **Accepted / Stable**)
   - `RFC-003: Traits & Interface Polymorphism` (Status: **Experimental / Gated**)
   - `RFC-004: Async/Await Concurrency Syntax` (Status: **Experimental / Gated**)

---

## 6. Pull Request Guidelines

1. **Branching Model**:
   - Work from a descriptive feature branch: `feature/xyz` or `fix/issue-123`.
   - Bug fixes for 1.1.x target `main` and may be backported to `release/1.0`.
2. **Commit Hygiene**:
   - Use Conventional Commits (`feat: ...`, `fix: ...`, `docs: ...`, `perf: ...`, `test: ...`).
3. **Documentation**:
   - Accompany any stdlib or language feature addition with documentation updates in `docs/` and verified examples in `tests/docs/doc_examples.test.ts`.
