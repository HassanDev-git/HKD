# HKD RFC-004: Language-Level Async/Await Ergonomics — Status Report

**Date:** September 2026  
**Auditor:** Lead Compiler Engineer & Runtime Architect  
**Specification:** `rfcs/004-async-ergonomics.md`  
**Tracking Issue:** `#1004`  
**Target Edition:** `2027` (or `#feature(async)`)  
**Current Status:** `Proposed / Feature-Gated (Expected Experimental)`  

---

## 1. Overview & Objectives

RFC-004 introduces first-class asynchronous programming syntax to HKD:
* `async fn fetch_data() -> String { ... }`
* `let response = await http.get("localhost", 8080, "/data")`
* Coroutine state-machine desugaring directly over HKD's existing single-threaded task scheduler and event-loop (`std.task`, HTTP client/server), avoiding OS thread overhead.

---

## 2. Comprehensive Subsystem Audit

### 2.1 Lexer Status
* **Token Definition:** `TokenKind.Async` and `TokenKind.Await` exist in `src/lexer/token.ts`.
* **Edition Gating:** In `src/lexer/lexer.ts`, `async` and `await` are tokenized as keywords **only when `edition === "2027"`**. In Edition 2026, they are tokenized as standard identifiers (`Ident`), ensuring that existing code using `async` or `await` as variable names continues to compile without errors.
* **Status:** PASS (Fully Gated).

### 2.2 Parser Status
* **Current State:**
  - Token definitions exist in lexer.
  - AST node annotations for `async` functions and `AwaitExpr` exist in draft form.
  - Main parser `src/parser/parser.ts` does not yet accept `async fn` or `await expr` in statement grammar.
* **Required Work:**
  - Add `async: boolean` to `FunctionDeclStmt` and `FunctionExpr` in `src/ast/nodes.ts`.
  - Add `AwaitExpr { kind: "AwaitExpr", expr: Expr }` to `Expr` union.
  - Update `parseFunctionDecl` and `parsePrimary` to handle `async` and `await` when `this.edition === "2027"`.

### 2.3 Semantic Analysis Status
* **Current State:**
  - Not yet implemented.
* **Required Work:**
  - Return type wrapping: an `async fn (...) -> T` semantically returns `Future<T>` / `Promise<T>`.
  - Validation that `await` expressions are only permitted inside an enclosing `async fn`.
  - Type checking of the awaited expression (must implement future/promise contract).

### 2.4 Bytecode Compiler & Runtime Status
* **Runtime Scheduler Foundation:**
  - HKD already possesses a robust asynchronous foundation:
    - `std.task.sleep(ms)`: Timer integration.
    - `std.http`: Non-blocking HTTP client and server APIs.
    - VM microtask and event queue architecture.
* **Compiler Lowering Architecture:**
  - An `async fn` lowers into a state-machine closure with an integer `state` field.
  - Each `await` point splits the function body:
    - State 0: Run from beginning to first `await`. Schedule continuation task on scheduler. Return pending future.
    - State 1: Resumed by scheduler on task completion. Unpack result into local slot. Continue execution.
  - Yields zero runtime allocations beyond the state frame.

### 2.5 Release Acceptance Verification
* **Gate Check:** The release verification script (`src/tooling/verify-release.ts`) and RFC validator (`src/tooling/rfc-validator.ts`) audit RFC-004:
  ```text
  [PASS] RFC-004 Async/Await keywords edition-gated
  [PASS] RFC-004 Backward compatibility preserved for Edition 2026
  [EXPECTED] RFC-004 Async/Await marked as experimental / Edition 2027
  ```
* **Release Impact:** 0 release blockers. Does not block HKD 1.1.0 public release.

---

## 3. Edition 2027 Roadmap & Milestones

1. **Milestone 1:** Complete grammar integration for `async fn` and `await expr` in `src/parser/parser.ts`.
2. **Milestone 2:** Implement `Future<T>` type constructor in `src/semantic/types.ts`.
3. **Milestone 3:** Build coroutine state-machine lowering in `src/bytecode/compiler.ts`.
4. **Milestone 4:** Connect state-machine yield/resume to `std.task` event loop.
5. **Milestone 5:** Conformance test suite with 25+ async/await tests.
