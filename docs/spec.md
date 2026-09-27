# HKD 1.0.0 Normative Language Specification

## 1. Scope & Conformance
This document specifies the syntax, semantics, and execution model of the HKD Programming Language, Edition 2026 (Version 1.0.0).

A conforming HKD implementation must:
1. Accept any syntactically and semantically valid HKD program as defined herein.
2. Reject any program containing syntax or static semantic errors with diagnostic error codes in the `E100`–`E399` range.
3. Produce identical runtime output, side effects, and exit codes across all execution tiers (Reference VM, Native JIT, Native AOT).

---

## 2. Lexical Grammar

### 2.1 Source Character Set
HKD source code is encoded in UTF-8.

### 2.2 Comments
- Single-line comments begin with `//` and extend to the end of the physical line.
- Multi-line block comments begin with `/*` and terminate with `*/`. Nested block comments are permitted.

### 2.3 Identifiers
Identifiers start with an ASCII letter (`[a-zA-Z]`) or underscore (`_`), followed by zero or more ASCII letters, digits (`[0-9]`), or underscores.
Keywords may not be used as identifiers.

### 2.4 Keywords
```text
fn, let, const, if, else, while, for, in, return, break, continue,
struct, type, import, from, export, test, assert, true, false, null,
async, await, try, catch, throw
```

### 2.5 Literals
- **Integer Literals**: Decimal integers (e.g. `42`, `-10`), hexadecimal prefixed by `0x` (e.g. `0x2A`), binary prefixed by `0b` (e.g. `0b101010`).
- **Float Literals**: Decimal numbers with fractional points or scientific exponents (e.g. `3.14159`, `1e-4`).
- **String Literals**: Double-quoted UTF-8 strings supporting escape sequences (`\n`, `\r`, `\t`, `\"`, `\\`, `\xHH`, `\uHHHH`).
- **Boolean Literals**: `true`, `false`.
- **Null Literal**: `null`.

---

## 3. Types & Values

HKD is a statically checked, dynamically optimized language with strong typing and type inference.

### 3.1 Primitive Types
- `int`: 64-bit signed integer.
- `float`: 64-bit IEEE 754 floating-point number.
- `bool`: Boolean value (`true` or `false`).
- `str`: Immutable UTF-8 byte sequence with O(1) length.
- `null`: The singleton unit value indicating absence of a value.

### 3.2 Composite Types
- **Array (`[T]`)**: Dynamically-sized, contiguous sequence of elements indexed from `0` to `len - 1`.
- **Object (`{ key: T }`)**: Key-value map with string keys.
- **Struct**: Nominal user-defined data structures declared via `struct Name { ... }`.
- **Function (`fn(T1, ...) -> R`)**: First-class callable values and lexical closures.

---

## 4. Statements & Declarations

### 4.1 Variable Binding
- `let x = expr`: Mutable local or global variable binding.
- `const x = expr`: Immutable local or global constant binding. Reassignment results in static error `E304`.

### 4.2 Functions
Functions are declared using `fn name(param1: Type, ...) -> ReturnType { ... }`.
Functions capture enclosing lexical variables by reference into closures.

### 4.3 Control Flow
- `if condition { ... } else { ... }`: Conditional branch. The condition must evaluate to `bool`.
- `while condition { ... }`: Loop while condition is true.
- `for item in collection { ... }`: Iterates over array elements, string characters, or ranges.
- `break`: Terminate innermost loop immediately.
- `continue`: Skip to next iteration of innermost loop.
- `return [expr]`: Return from function with optional value (defaults to `null`).

### 4.4 Assertions
- `assert(condition [, "message"])`: Asserts that `condition` evaluates to `true`. If false, aborts execution with assertion error.

### 4.5 Testing
- `test "name" { ... }`: Declares an isolated unit test block collected and executed by `hkd test`.

---

## 5. Standard Modules
A conforming implementation provides built-in access to canonical modules via `import <mod>`:
- `math`: Trigonometric, exponential, rounding, and logarithmic primitives.
- `str`: String manipulation, splitting, substring, trim, and casing.
- `array`: Functional transformations (`map`, `filter`, `reduce`), sorting, and slicing.
- `json`: High-performance JSON `parse`, `stringify`, and `stringify_pretty`.
- `env`: Environment variable access (`get`, `set`, `args`).
- `http`: Production HTTP client (`get`, `post`) and server (`serve`, `metrics`).
- `process`: Process spawning, exit status, and stdout/stderr capture.
- `task`: Async coordination, sleep, and scheduling primitives.
