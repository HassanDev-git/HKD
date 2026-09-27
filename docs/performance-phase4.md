# HKD Native Runtime Performance Audit (Phase 4)

This document provides a detailed technical audit of the current **HKD Native Zig Runtime** implementation. It identifies key structures, data representations, opcode dispatch, memory management, and targets for Phase 4 optimization.

---

## 1. Core Runtime Specifications & Architectures

The current runtime implements a stack-based virtual machine executing versioned portable bytecode (`.hkdb`).

### A. Value Representation
All runtime values are packed inside a single tagged union:
```zig
pub const Value = union(ValueType) {
    Null: void,
    Boolean: bool,
    Number: f64,
    String: *HkdString,
    Array: *HkdArray,
    Object: *HkdObject,
    Function: *HkdFunction,
    Closure: *HkdClosure,
    Iterator: *HkdIterator,
    Native: HkdNativeFn,
    BoundNative: HkdBoundNative,
};
```
* **Heap Allocated Objects**: `String`, `Array`, `Object`, `Closure`, `Iterator` are pointer-based and reference-counted.
* **Inline Stack values**: `Null`, `Boolean`, `Number`, `Native`, `BoundNative` (which packages target `*anyopaque` and `func: HkdNativeFn` inline) do not require heap allocation.

### B. VM Stack & Call Frames
* **VM Stack**: Fixed-size array of 2048 `Value` elements (`self.stack`). Push and pop operations adjust `self.stack_top`.
* **Call Stack**: Fixed-size array of 256 `CallFrame` structures (`self.frames`).
* **CallFrame structure**:
  ```zig
  pub const CallFrame = struct {
      function: *HkdFunction,
      closure: ?*HkdClosure,
      ip: usize,
      base: usize,
  };
  ```
  This is extremely lean. The instruction pointer (`ip`) directly offsets into `frame.function.code`. Accessing constants resolves through `frame.function.constants`.

### C. Opcode Dispatch
The interpreter loop uses a `switch` statement over the byte read from `frame.function.code[frame.ip]`:
```zig
const op = @as(Op, @enumFromInt(self.readByte()));
switch (op) {
    .LoadConst => ...
    ...
}
```
Zig / LLVM compiles this `switch` into a jump table on Windows.

### D. Memory Management & Allocations
* **Reference Counting**: Managed via explicit `retain(val)` and `release(allocator, val)` calls.
* **Heap Allocator**: Uses the standard library `std.heap.smp_allocator` for all allocations, ensuring thread-safe, fast user-space memory management.
* **Zero-Allocation raw functions**: Functions without lexical scope captures (`upvalue_count == 0`) do not allocate a closure object. Their frame uses `closure = null`, executing completely on the stack.

---

## 2. Identified Performance Hotspots & Optimization Plan

Based on repository audits and initial benchmark comparisons:

### 1. Opcode Dispatch Overhead
The current loop does a `switch(op)` dispatch. We will profile and evaluate:
* Direct-threaded code (using GNU C style labels-as-values if supported).
* Hand-tuned jump-tables.
* Specializing common sequences (Superinstructions).

### 2. VM Stack and Pointer Offsets
* Pop and push modify `stack_top` and read/write values. We can look into caching the top of the stack in a CPU register (local variable).
* Bounds checks can be bypassed under optimized `ReleaseFast` builds safely, while keeping them active in debug/testing.

### 3. Object Lookup (`std.StringHashMap`)
Object fields are currently stored in a standard `std.StringHashMap(Value)`.
* This causes string hashing and dynamic probing on every property read/write (`GetField`/`SetField`).
* **Target**: Implement a fast open-addressed HashMap, Robin Hood hashing, or a simple property layout cache to bypass map lookup for repeated access.

### 4. String Operations
String concatenation allocates new arrays and slices.
* We can look into string interning or small-string optimization (SSO) if profiling indicates severe allocation overhead.

### 5. Array Allocation & Slicing
* Array capacity growth uses standard `std.ArrayList` growth.
* Pre-allocating elements or choosing custom growth factors can optimize `1M Array Push` workloads.

---

## 3. Repeatable Profiling Pipeline
We will measure and analyze:
* Process startup latency.
* Bytecode file parsing and loading overhead.
* Instruction execution frequency counts.
* Memory allocation density.
