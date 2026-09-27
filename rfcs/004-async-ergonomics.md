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

## 4. Backward Compatibility

* Existing synchronous code and `std.task` functions remain unchanged.
* `async` and `await` are treated as keywords only when `#feature(async)` or `edition = "2027"` is active.

---

## 5. Drawbacks and Alternatives

* **Drawbacks**: State machine generation increases compiler code size and memory footprint for suspended task frames.
* **Alternatives Considered**: OS threads or green-thread fibers. Event-loop-backed state machines were chosen to preserve low memory overhead and seamless compatibility with HKD's single-threaded event loop.

