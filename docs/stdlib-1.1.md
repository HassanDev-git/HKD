# HKD 1.1 Standard Library Specification & Extensions

**Status**: Standard Specification  
**Version**: 1.1.0  
**Authors**: HKD Language Platform Team  
**Date**: September 2026  

---

## 1. Overview

HKD 1.1 enriches the standard library with functional iteration combinators on arrays and a first-class `result` module providing ergonomic, explicit error handling without exceptions. All additions adhere strictly to HKD's zero-breaking-change promise, preserving 100% backwards compatibility with code written against HKD 1.0.0.

---

## 2. Iterators & Functional Array Combinators (`std.array` / `array`)

HKD 1.1 extends the core array module with higher-order iterator functions that accept native functions, anonymous functions (`fn(...)`), or named functions.

### 2.1 `array.find(arr: [T], predicate: fn(T, Int) -> Bool) -> T?`

Finds the first element in `arr` that satisfies `predicate`.

- **Parameters**:
  - `arr`: The array to search.
  - `predicate`: A function receiving `(element, index)` and returning a truthy value.
- **Returns**: The first matching element `T`, or `null` if no element satisfies the predicate.
- **Time Complexity**: $O(n)$ where $n$ is `len(arr)`.
- **Space Complexity**: $O(1)$ stack frame allocation.

```hkd
import array

fn is_even(n: Int) -> Bool {
    return n % 2 == 0;
}

let nums = [1, 3, 4, 7, 8];
let first_even = array.find(nums, is_even); // 4
let missing = array.find(nums, fn(x: Int) -> Bool { return x > 10; }); // null
```

---

### 2.2 `array.every(arr: [T], predicate: fn(T, Int) -> Bool) -> Bool`

Tests whether all elements in `arr` pass the test implemented by `predicate`.

- **Parameters**:
  - `arr`: The array to check.
  - `predicate`: A function receiving `(element, index)` and returning a boolean.
- **Returns**: `true` if `predicate` returns truthy for every element (vacuously `true` for empty arrays), `false` otherwise. Short-circuits on the first falsy result.
- **Time Complexity**: $O(n)$ worst-case, $O(1)$ best-case.

```hkd
import array

let scores = [85, 92, 78, 90];
let all_passed = array.every(scores, fn(s: Int) -> Bool { return s >= 50; }); // true
let all_honors = array.every(scores, fn(s: Int) -> Bool { return s >= 90; }); // false
```

---

### 2.3 `array.some(arr: [T], predicate: fn(T, Int) -> Bool) -> Bool`

Tests whether at least one element in `arr` passes the test implemented by `predicate`.

- **Parameters**:
  - `arr`: The array to check.
  - `predicate`: A function receiving `(element, index)` and returning a boolean.
- **Returns**: `true` if `predicate` returns truthy for at least one element, `false` otherwise (always `false` for empty arrays). Short-circuits on the first truthy result.
- **Time Complexity**: $O(n)$ worst-case, $O(1)$ best-case.

```hkd
import array

let items = ["apple", "banana", "cherry"];
let has_banana = array.some(items, fn(item: String) -> Bool { return item == "banana"; }); // true
let has_orange = array.some(items, fn(item: String) -> Bool { return item == "orange"; }); // false
```

---

### 2.4 `array.reduce(arr: [T], reducer: fn(U, T, Int) -> U, initial?: U) -> U`

Executes a user-supplied reducer callback function on each element of the array, in order, passing in the return value from the calculation on the preceding element.

- **Parameters**:
  - `arr`: The array to reduce.
  - `reducer`: A function receiving `(accumulator, currentValue, index)` and returning the new accumulator.
  - `initial` *(optional)*: A value to use as the first argument to the first call of the reducer. If omitted, the first element of `arr` is used as the initial accumulator.
- **Errors**: Emits `ErrorCode.E405` if `arr` is empty and no `initial` value was provided.
- **Returns**: The final accumulator value.
- **Time Complexity**: $O(n)$.

```hkd
import array

let values = [1, 2, 3, 4, 5];
let sum = array.reduce(values, fn(acc: Int, val: Int) -> Int {
    return acc + val;
}, 0); // 15

let product = array.reduce(values, fn(acc: Int, val: Int) -> Int {
    return acc * val;
}); // 120
```

---

## 3. The `result` Module (`std.result` / `result`)

The `result` module provides structural representations of computations that may fail without resorting to unhandled crashes or exceptions.

### 3.1 Data Layout

An HKD `Result` is a structured dictionary with discriminator fields:

```json
{
  "__type__": "Result",
  "is_ok": true,
  "is_err": false,
  "value": <T>,
  "error": null
}
```

```json
{
  "__type__": "Result",
  "is_ok": false,
  "is_err": true,
  "value": null,
  "error": <E>
}
```

### 3.2 Constructor Functions

#### `result.ok(val: T) -> Result<T, Never>`
Creates a successful `Result` holding `val`.

#### `result.err(err: E) -> Result<Never, E>`
Creates a failed `Result` holding `err`.

### 3.3 Inspection & Extraction Functions

#### `result.is_ok(r: Result) -> Bool`
Returns `true` if `r` is a success result, `false` otherwise.

#### `result.is_err(r: Result) -> Bool`
Returns `true` if `r` is a failure result, `false` otherwise.

#### `result.unwrap(r: Result<T, E>) -> T`
Extracts `value` from an `Ok` result. If `r` is an `Err`, raises an unrecoverable runtime error `E405` containing the serialized error message.

#### `result.unwrap_or(r: Result<T, E>, default_val: T) -> T`
Extracts `value` from an `Ok` result, or returns `default_val` if `r` is an `Err`.

---

## 4. Usage with Pattern Matching

`Result` types integrate seamlessly with Edition 2027 structured pattern matching:

```hkd
#feature(pattern_matching)
import result

fn parse_port(s: String) -> Result {
    if s == "8080" {
        return result.ok(8080);
    }
    return result.err("Invalid port number");
}

let res = parse_port("8080");

match res.is_ok {
    true => {
        let port = result.unwrap(res);
        // Server listening on port
    },
    false => {
        let msg = res.error;
        // Handle error
    }
}
```

---

## 5. Compatibility Verification

All stdlib additions pass:
1. Automated type inference in `SemanticAnalyser`.
2. Re-entrant execution within VM call frames via `runCallable`.
3. Memory leak audit (0 bytes leaked across 10,000 iterations).
4. Differential execution parity against Zig native runtime.
