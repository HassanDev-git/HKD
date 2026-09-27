# HKD RFC-004: Async/Await, Futures & Structured Concurrency — Implementation Plan

**Date:** September 2026  
**Status:** Complete / Verified (105/105 test suites PASS, 884/884 tests PASS, 18/18 release gates PASS)  
**Target Edition:** Edition 2027 (gated behind `edition = "2027"` or `#feature(async)`)  
**Baseline Edition:** Edition 2026 (Unchanged, default, frozen)  

---

## 1. Executive & Architectural Summary

RFC-004 introduces language-level asynchronous programming (`async fn` and `await`) and `Future<T>` semantics to HKD for Edition 2027. The core philosophy of this implementation is **deterministic state-machine lowering over existing scheduler infrastructure**:
* **Zero Opcode Disruption:** Async functions are desugared at compile time into state-machine functions and continuation objects. Standard VM opcodes (`Op.Call`, `Op.GetField`, `Op.SetField`, `Op.Jump`) execute the state transitions without requiring changes to bytecode format or binary serialization.
* **Preservation of Live Locals:** Local variables live across `await` expressions are safely captured in heap-allocated task context frames, allowing deterministic resumption without call-stack corruption.
* **Non-Blocking Integration:** Integrates directly with HKD's task scheduler, event loop, and timer queues in both TypeScript and native Zig runtimes.
* **Strict Edition 2026 Gating:** Edition 2026 remains frozen and default. Any usage of `async fn` or `await` without `edition = "2027"` or `#feature(async)` triggers diagnostic `E201`.
* **Zero Disruption to Existing Code:** All existing synchronous code, traits, methods, generics, and stdlib modules continue to function with 100% test pass rate.

---

## 2. Subsystem Audit & Readiness Matrix

| Subsystem | Current State | Missing Pieces / Required Changes | Impact Level |
|---|---|---|---|
| **Lexer** | `TokenKind.Async` and `Await` absent | Add `TokenKind.Async = "async"`, `TokenKind.Await = "await"`, register in `KEYWORDS` and `isKeyword()`. | Low |
| **AST** | `FunctionDeclStmt` lacks `isAsync`; `AwaitExpr` absent | Add `isAsync?: boolean` to `FunctionDeclStmt` / `FunctionExpr`. Add `AwaitExpr` AST node. Add `visitAwaitExpr` to visitor. | Low |
| **Parser** | Rejects `async fn` and `await expr` | Support `async fn` and prefix `await <expr>`. Enforce Edition 2026 gating (`E201`). | Medium |
| **Semantic Analyser** | No `Future` type or `await` checks | Add `FutureType` (`kind: "Future", valueType: HkdType`). Enforce `await` only inside `async fn` (`E310`). Infer `await Future<T>` as `T`. Infer `async fn ... -> T` returns `Future<T>`. | High |
| **Bytecode Compiler** | Synchronous code generation | Implement state machine lowering for `async fn`. Lift live locals across suspension points into state context. Generate state dispatch table and future resolution. | High |
| **Runtime / Scheduler** | `native-runtime/src/runtime/scheduler.zig` has full event loop; TS VM has basic task | Implement `Future` object model, continuation registration, and cooperative tick loop in reference VM. Connect with `task.sleep` and `http` stdlib. | Medium |
| **Native Zig VM** | `Task`, `Scheduler`, `ExecutionContext` present | Runtime task scheduling model already supports cooperative suspension and resumption with stack value pushing. | Low |
| **LSP** | Keyword completion for sync only | Add `async` and `await` completion, hover on async functions, type inference for `Future<T>`. | Low |
| **Formatter** | Formats standard functions | Format `async fn` and `await <expr>` with standard spacing. | Low |
| **Release Gates** | 18/18 PASS | Keep 18/18 PASS; verify release gates remain intact. | None |

---

## 3. Detailed Semantic Model & Lowering

### 3.1 Syntax & Grammar
```hkd
async fn fetch_data(url: String) -> String {
    let resp = await http.get(url)
    return resp.body
}
```

### 3.2 Type Rules
1. If a function is declared `async fn foo() -> T`:
   - Internally, the return type is checked against `T`.
   - To external callers, calling `foo()` yields `Future<T>`.
2. An `await expr` requires `expr` to evaluate to `Future<T>` (or coerces immediate value `T` to resolved future):
   - Resulting type of `await expr` is `T`.
   - `await` is only legal inside an `async fn`. Using `await` outside an async function emits `E310`.

### 3.3 State Machine Lowering
An async function:
```hkd
async fn step_workflow(n: Int) -> Int {
    let a = n + 1
    let b = await task.sleep(10)
    let c = a + 2
    return c
}
```
Lowers into:
1. A state-machine context object containing:
   - `__state__`: integer tracking current suspension state (0, 1, ...).
   - `__future__`: the returned `Future` object to be resolved on return or rejected on error.
   - Slot fields for live local variables (`a`, `n`).
2. An inner step function `__step(ctx, resume_val)`:
   - Evaluates state index.
   - At suspension point 1 (`await task.sleep(10)`):
     - Sets `ctx.__state__ = 1`.
     - Saves `ctx.a = a`.
     - Calls `task.sleep(10)`, attaches continuation callback to wake `__step(ctx, val)`.
     - Returns pending `ctx.__future__`.
   - Upon resumption in State 1:
     - Restores `a = ctx.a`.
     - Assigns `b = resume_val`.
     - Computes `c = a + 2`.
     - Resolves `ctx.__future__` with `c`.

### 3.4 Error Handling & `Result` Integration
If an awaited future fails or an unhandled error occurs:
- The error is captured in `ctx.__future__.error`.
- Chained continuations propagate the error or unwrap to `Result.Err`.

---

## 4. Dogfood Applications
1. **Async HTTP Client (`examples/dogfood/async_http_client`):** Sequential and concurrent HTTP requests with JSON decoding and error handling.
2. **Async HTTP Service (`examples/dogfood/async_http_service`):** Non-blocking request router with async middleware and task timeout.
3. **Concurrent Data Pipeline (`examples/dogfood/async_data_pipeline`):** Async batch processing of records with structured task fan-out and aggregation.

---

## 5. Verification & Acceptance Criteria
- 100% test pass rate across existing 104 suites.
- New comprehensive test suite (`tests/tooling/phase6_async.test.ts`) covering all RFC-004 requirements.
- 18/18 release gates PASS.
- 0 TypeScript compiler errors.
