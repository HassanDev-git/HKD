# HKD VM Specification

This document describes the execution model, stack layout, closures, and call frame semantics of the HKD Virtual Machine.

---

## 1. Stack and Execution Frame Layout

The HKD VM is a stack-based virtual machine. It maintains:
1. **Value Stack**: A flat array of `Value` slots of fixed size (e.g. 2048 slots).
2. **Call Frame Stack**: A list of active execution contexts (up to 256 depth).

Each `CallFrame` corresponds to an active function invocation:
```zig
const CallFrame = struct {
    closure: *HkdClosure,
    ip: usize,             // Instruction pointer (offset into chunk code)
    base: usize,           // Base index in the Value Stack where local slots begin
};
```

---

## 2. Variable Resolving Semantics

- **Locals**: Accessed relative to the current frame's `base` using the `u16` slot index operand:
  - `LoadLocal slot` pushes the value at `stack[base + slot]`.
  - `StoreLocal slot` writes the top stack value (TOS) to `stack[base + slot]`.
- **Globals**: Resolved dynamically by name in a global map (`Map<string, Value>`).
- **Upvalues**: Used for closures. They hold a reference to variables that reside on the stack (when "open") or have been copied to the heap (when "closed").

---

## 3. Upvalue and Closure Management

When compiling a function that accesses outer scope variables, the compiler creates a `Closure` with an array of Upvalue references.
- **Open Upvalue**: Points to a slot on the stack (`stack[index]`).
- **Closed Upvalue**: When a stack frame returns, all open upvalues referencing slots in that frame are "closed" (the stack value is copied into the Upvalue heap storage itself, and the reference to the stack is detached).
- **Op.MakeClosure**: Emitted to instantiate a new `Closure` at runtime. The VM reads the function constant, reads descriptors (isLocal, index), and hooks up the correct upvalues.

---

## 4. Arithmetic and Comparisons

- **Arithmetic (`Add`, `Sub`, `Mul`, `Div`, `Mod`, `Pow`)**:
  - Pops the right operand, pops the left operand.
  - Requires both operands to be Numbers.
  - Pushes the resulting Number.
- **Division by Zero**: division or modulo by `0` throws a `VmError` (`ErrorCode.E401`) and terminates execution with code 1.
- **Comparisons (`Eq`, `Ne`, `Lt`, `Le`, `Gt`, `Ge`)**:
  - Requires matching primitive types or numbers.
  - Pushes a Boolean result.
- **Logical Not (`Not`)**:
  - Inverts truthiness of TOS.

---

## 5. Control Flow

- **Unconditional Jump (`Jump offset`)**:
  - Adjusts `ip` by the signed 16-bit offset.
- **Conditional Jump (`JumpFalse offset` / `JumpTrue offset` / `JumpNull offset`)**:
  - Inspects TOS (or pops it depending on semantics). If condition matches, adjusts `ip` by offset.
- **Iterator Loop (`IterNext offset`)**:
  - Advances iterator. If elements remain, pushes the next value. If iterator is depleted, jumps to offset.
