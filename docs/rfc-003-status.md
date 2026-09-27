# HKD RFC-003: Behavioural Contracts & Traits — Status Report

**Date:** September 2026  
**Auditor:** Lead Compiler Engineer & Language Architect  
**Specification:** `rfcs/003-traits.md`  
**Tracking Issue:** `#1003`  
**Target Edition:** `2027` (or `#feature(traits)`)  
**Current Status:** `Proposed / Feature-Gated (Expected Experimental)`  

---

## 1. Overview & Objectives

RFC-003 specifies a contract-based behavioral interface system for HKD, enabling:
* Declared behavioral contracts: `trait Summary { fn summarize(self) -> String }`.
* Type implementations: `impl Summary for Article { ... }`.
* Statically monomorphized dispatch when types are known at compile time, eliminating vtable lookups.
* Bounded generic polymorphism: `fn print_summary<T: Summary>(item: T)`.

---

## 2. Comprehensive Subsystem Audit

### 2.1 Lexer Status
* **Token Definition:** `TokenKind.Trait` exists in `src/lexer/token.ts`.
* **Edition Gating:** In `src/lexer/lexer.ts`, `trait` is recognized as a keyword **only when `edition === "2027"`**. In Edition 2026, `trait` is treated as a regular identifier, ensuring complete zero-breakage backward compatibility.
* **Status:** PASS (Fully Gated).

### 2.2 Parser Status
* **Current State:**
  - Token recognition exists.
  - AST nodes for `TraitDeclStmt` and `ImplStmt` are drafted in RFC-003 but not yet merged into `src/ast/nodes.ts`.
  - Main parser `src/parser/parser.ts` does not yet parse `trait Name { ... }` or `impl Trait for Type { ... }`.
* **Required Work:**
  - Add `TraitDeclStmt` and `TraitImplStmt` to `src/ast/nodes.ts`.
  - Implement `parseTraitDecl` and `parseImplDecl` in `src/parser/parser.ts`, gated behind `this.edition === "2027"`.

### 2.3 Semantic Analysis Status
* **Current State:**
  - Not yet implemented.
* **Required Work:**
  - Trait definition registration in `TraitTable`.
  - Coherence and orphan rule validation (preventing duplicate or conflicting `impl` blocks).
  - Method signature matching: verify parameter types, return type, and `self` receiver.
  - Trait bound checking on generic parameters (`T: Summary`).

### 2.4 Bytecode Compiler & Runtime Status
* **Current State:**
  - Not yet implemented.
* **Design Strategy:**
  - **Static Monomorphic Lowering (Phase 1):** Call sites with concrete receiver types (`a: Article; a.summarize()`) rewrite directly to `Article_Summary_summarize(a)`, requiring zero modifications to the Native Zig VM or Reference Stack VM.
  - **Dynamic Trait Objects (Phase 2):** Optional fat-pointer representation `(data_ptr, vtable_ptr)` for heterogeneous trait collections (`dyn Summary`).

### 2.5 Release Acceptance Verification
* **Gate Check:** The release verification script (`src/tooling/verify-release.ts`) and RFC validator (`src/tooling/rfc-validator.ts`) explicitly audit RFC-003:
  ```text
  [PASS] RFC-003 Trait keyword edition-gated
  [PASS] RFC-003 Backward compatibility preserved for Edition 2026
  [EXPECTED] RFC-003 Traits marked as experimental / Edition 2027
  ```
* **Release Impact:** 0 release blockers. Does not block HKD 1.1.0 public release.

---

## 3. Edition 2027 Roadmap & Milestones

1. **Milestone 1:** Land inherent struct methods (`impl Struct { ... }`) per `docs/rfc-methods-proposal.md`.
2. **Milestone 2:** Implement `trait` parser rules and AST nodes in `src/parser/parser.ts`.
3. **Milestone 3:** Implement semantic coherence checker and method signature verifier.
4. **Milestone 4:** Wire static monomorphic code generation in `src/bytecode/compiler.ts`.
5. **Milestone 5:** Conformance test suite with 30+ trait tests across reference and native VMs.
