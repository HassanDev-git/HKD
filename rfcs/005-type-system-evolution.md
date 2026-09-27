# RFC 005: Type System Evolution, Result Type & Static Inference for HKD 1.1

- Feature Name: `type_system_evolution`
- Start Date: 2026-09-04
- RFC PR: [hkd/rfcs#005](https://github.com/hkdlang/rfcs/pull/005)
- Tracking Issue: [hkd/hkd#1005](https://github.com/hkdlang/hkd/issues/1005)
- Target Edition: `2027` (or `#feature(type_system)`)
- Status: `Proposed`

---

## 1. Summary

This RFC outlines foundational enhancements to the HKD type system for HKD 1.1:
1. First-class `Result<T, E>` sum type for robust error handling.
2. Local type inference propagation across variable bindings and return expressions.
3. Enhanced diagnostics with type difference explanations.
4. Foundation for tagged union variants and pattern destructuring.

---

## 2. Motivation

In HKD 1.0, error conditions frequently result in either runtime panics or null returns. Unhandled nulls lead to common runtime exceptions, while panics interrupt control flow abruptly. The introduction of `Result<T, E>` makes error states visible in function signatures and requires callers to handle outcomes explicitly or propagate them safely.

---

## 3. Detailed Design: Result Type & Static Inference

In place of unhandled panics or null returns, HKD 1.1 introduces `Result<T, E>`:

```hkd
fn divide(a: Int, b: Int) -> Result<Int, String> {
    if b == 0 {
        return Result.err("Division by zero")
    }
    return Result.ok(a / b)
}

let res = divide(10, 2)
match res {
    Result.ok(val)  => print("Success: " + to_string(val)),
    Result.err(msg) => print("Error: " + msg)
}
```

### Result Methods
* `is_ok() -> Bool`
* `is_err() -> Bool`
* `unwrap() -> T` (panics with error message if Err)
* `unwrap_or(default: T) -> T`

---

## 4. Backward Compatibility

* In 1.0 code, existing error handling and panic models continue working without modification.
* Existing CLI exit code mapping (0 for success, 1..5 for specific error categories) remains strictly preserved.

---

## 5. Drawbacks and Alternatives

* **Drawbacks**: Sum types and monadic result handling require developer discipline and wrapping/unwrapping boilerplate.
* **Alternatives Considered**: Checked exceptions (like Java) or Go-style multiple return values `(val, err)`. `Result<T, E>` was chosen because it cleanly composes with pattern matching and higher-order functional combinators.
