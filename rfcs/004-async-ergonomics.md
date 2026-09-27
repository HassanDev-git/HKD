# RFC 004: Language-Level Async/Await Ergonomics for HKD

- Feature Name: `async_ergonomics`
- Start Date: 2026-09-04
- RFC PR: [hkd/rfcs#004](https://github.com/hkdlang/rfcs/pull/004)
- Tracking Issue: [hkd/hkd#1004](https://github.com/hkdlang/hkd/issues/1004)
- Target Edition: `2027` (or `#feature(async)`)
- Status: `Proposed`

---

## 1. Summary

This RFC specifies language-level asynchronous syntax (`async fn` and `await`) that integrates natively with HKD's existing event-loop and task scheduling infrastructure (`std.task`, HTTP client/server).

```hkd
async fn fetch_user_data(user_id: Int) -> String {
    let resp = await http.get("127.0.0.1", 8080, "/users/" + to_string(user_id))
    return resp.body
}
```

---

## 2. Motivation

HKD 1.0 supports asynchronous tasks via the `task` stdlib module and callback mechanisms, but writing sequential asynchronous logic (such as consecutive HTTP calls, file I/O, or database queries) suffers from callback nesting. First-class `async` and `await` syntax allows asynchronous code to read linearly while non-blocking execution is preserved.

---

## 3. Detailed Design & Lowering

### Integration with Existing Scheduler
Rather than introducing a separate runtime thread model or green-thread scheduler, `async fn` compiles to state machines that schedule continuations directly on the existing `TaskQueue` / event-loop in the VM and native Zig runtime.

### Desugaring
```hkd
async fn process() -> Int {
    let a = await step1()
    return a + 1
}
```
Lowers into an asynchronous state machine with:
* State 0: invoke `step1()`, register callback on completion, suspend.
* State 1: resume with result `a`, compute `a + 1`, resolve returned promise/future.

---

## 4. Phase 6.5 Production Hardening Specification

### 4.1 Future State Machine Invariants
HKD Futures strictly adhere to a deterministic 3-state lifecycle:
1. `pending`: Initial state upon instantiation via `task.future()` or async function invocation.
2. `resolved`: Terminal state carrying successful resolution value.
3. `rejected`: Terminal state carrying error/failure cause.

**Terminal Immutability**:
* Legal transitions: `pending -> resolved` or `pending -> rejected`.
* Transitions from terminal states are forbidden: double resolves, double rejects, cross-resolves (resolve after reject), and cross-rejects (reject after resolve) are safely ignored as immutable no-ops without mutation or exception.

### 4.2 Safe Error Semantics & `task.unwrap` Guards
* `task.unwrap(fut)` and `task.unwrap_future(fut)` enforce strict runtime assertions:
  - Throws `TaskError: Cannot unwrap pending Future. Task has not completed.` if future is `pending`.
  - Throws `TaskError: Called task.unwrap() on a rejected Future: <err>` if future is `rejected`.
  - Throws `TaskError: task.unwrap() expects a Future object, got <type>` if called on non-future values.
* When awaiting a rejected future within an `async fn`, rejection automatically propagates to the enclosing async function's returned future, preserving error backtraces without crashing the host process.

### 4.3 Structured Concurrency Hardening
* **`task.all(futures)`**:
  - Empty array fast-path: resolves immediately to empty list `[]`.
  - Fast-fail on pre-rejected futures: rejects immediately if any future is already in `rejected` state.
  - Loser detachment: upon the first asynchronous rejection, `task.all` rejects immediately and detaches remaining in-flight futures, preventing unhandled error crashes.
* **`task.race(futures)`**:
  - Index-order tie breaking: if multiple futures are already settled, index order deterministically decides the winner.
  - Winner settlement: resolves or rejects based on the earliest settled future.
  - Loser continuation detachment: loser callbacks are safely discarded.

### 4.4 Callback Trampoline & Deep Recursion Protection
* Callback invocation is managed via a non-recursive trampoline queue (`callbackQueue`) in the VM, preventing JavaScript or host call stack exhaustion during deep chains (1,000+ sequential callbacks).

### 4.5 Timer Clamping & Bounds
* `task.sleep(ms)` guarantees:
  - Negative values (`ms < 0`) or `NaN` are clamped safely to `0ms`.
  - Oversized values exceeding 32-bit signed integers (`ms > 2147483647`) are clamped to `2147483647ms`.

### 4.6 Struct Methods & Generics Support
* `async fn` is supported inside struct implementation blocks (`impl Struct { async fn method(self, ...) { ... } }`).
* Generic async functions monomorphize and desugar cleanly with full trait constraint checking.

---

## 5. Backward Compatibility

* Existing synchronous code and `std.task` functions remain unchanged.
* `async` and `await` are treated as keywords only when `#feature(async)` or `edition = "2027"` is active.
* Full differential parity is maintained across Reference Stack VM, JIT Engine, and Native Zig VM.

---

## 6. Drawbacks and Alternatives

* **Drawbacks**: State machine generation increases compiler code size and memory footprint for suspended task frames.
* **Alternatives Considered**: OS threads or green-thread fibers. Event-loop-backed state machines were chosen to preserve low memory overhead and seamless compatibility with HKD's single-threaded event loop.

