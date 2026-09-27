# HKD Release Blocker & Severity Governance

**Policy Scope**: HKD 1.1.0 Public Release  
**Governance Model**: Strict Human Maintainer Review  

---

## 1. Release Gate Severity Hierarchy

Every test, acceptance check, diagnostic gate, and defect reported in the HKD ecosystem is categorized under one of the following severity levels:

```text
CRITICAL
  │ (Blocks release unconditionally; zero waivers permitted)
  ▼
HIGH
  │ (Blocks release; strictly human-guarded waiver policy; no AI-generated waivers)
  ▼
MEDIUM
  │ (Release warning; requires maintainer review; non-blocking if low-risk)
  ▼
INFORMATIONAL / EXPECTED EXPERIMENTAL
  │ (Informative diagnostic; expected experimental features proceed)
```

---

## 2. Severity Definitions & Thresholds

### 2.1 CRITICAL (Immediate Release Blocker)
- **Definition**: Catastrophic defects that jeopardize data integrity, execution safety, or baseline backwards compatibility.
- **Examples**:
  - Compiler crashes or unhandled exceptions on valid syntax.
  - Silent incorrect code generation or memory corruption.
  - Breaking changes to Language Edition 2026 syntax, semantics, or ABI.
  - Security vulnerabilities allowing arbitrary code execution or uncontained path traversal.
  - 10,000-cycle soak memory leaks or unbounded growth.
- **Release Decision**: **RELEASE BLOCKED**. No waiver can be granted under any circumstance.

### 2.2 HIGH (Strict Release Blocker)
- **Definition**: Significant defects in core functionality or security boundaries that degrade production guarantees.
- **Examples**:
  - Package manager checksum mismatch recovery failures.
  - Differential execution mismatch between Stack VM and Native runtime for supported language constructs.
  - Denial of service or unbounded resource consumption under high network load.
  - HIGH-severity dependency security advisories.
- **Release Decision**: **RELEASE BLOCKED**.
- **Human-Guarded Waiver Policy**:
  - Automated AI tools and agents are **strictly prohibited** from generating, assuming, or granting waivers.
  - Only a human maintainer, following documented risk evaluation and public changelog disclosure, can authorize an exception. In the absence of signed human maintainer authorization, release remains unconditionally blocked.

### 2.3 MEDIUM (Advisory Warning)
- **Definition**: Non-critical cosmetic issues, diagnostic formatting inconsistencies, or minor performance variance within accepted noise bands (< 5.0%).
- **Release Decision**: **WARN / NON-BLOCKING**. Logged for prioritization in the subsequent patch cycle (1.1.1).

### 2.4 EXPECTED EXPERIMENTAL (Permitted Progression)
- **Definition**: Features explicitly designated as experimental under active RFC evolution (e.g. RFC-003 Traits and RFC-004 Async/Await language syntax).
- **Condition**: Must be safely feature-gated behind `#feature(...)` or Edition 2027 flags, emit clear non-fatal diagnostic explanations, and avoid claiming complete production lowering.
- **Release Decision**: **RELEASE PROCEEDS**. Does not block stable 1.1.0 publication.
