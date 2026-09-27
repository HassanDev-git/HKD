# HKD 1.0.0 Operational Semantics & Execution Model

## 1. Evaluation Order
- Expression evaluation order is strictly left-to-right.
- Function arguments are evaluated in left-to-right order before the function call instruction is dispatched.
- Short-circuiting operators (`&&`, `||`) evaluate the left-hand operand first, and skip evaluation of the right-hand operand if the truth value is already determined.

---

## 2. Scoping & Variable Lifetime
- **Lexical Scoping**: Variables are scoped to the block (`{ ... }`) in which they are declared.
- **Shadowing**: Declaring a variable in an inner block with the same name as an outer block shadows the outer variable within that inner scope. Redeclaring in the exact same scope depth triggers error `E304`.
- **Closures**: Functions that reference variables in outer non-global scopes capture those variables as upvalues. Upvalues are maintained on the stack while active and closed onto the heap if the outer frame exits.

---

## 3. Memory & Value Model
- **Primitives** (`int`, `float`, `bool`, `null`) are passed by value and stored inline without heap indirection.
- **Heap Objects** (`str`, `[T]`, `{ key: val }`, `struct`, `closure`) are reference-counted.
  - In TypeScript VM: Managed by garbage collection.
  - In Native Zig Runtime: Deterministic ARC (Automatic Reference Counting) with `retain()` and `release()` primitives.
  - Circular references in structures without manual breaking are collected during process teardown.

---

## 4. Errors & Exception Model
- **Static Errors** (`E100`–`E399`): Checked and rejected at compile time before bytecode or machine code emission.
- **Runtime Panics** (`E400`–`E499`):
  - Out of bounds array indexing: Panics with `E401` or returns `null` depending on index syntax.
  - Division by zero: Floating-point returns `Infinity` / `NaN`; integer division panics with `E403`.
  - Type cast failure: Panics with `E405`.
  - Assertion failure: Aborts test execution and formats error report.
