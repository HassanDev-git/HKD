# HKD Native Runtime Specification

This document details the architecture, design choices, and abstraction layers for the native HKD runtime.

---

## 1. Systems Language Selection: Zig

We have selected **Zig** as the implementation language for the native HKD runtime.

### Rationale:
- **Zero-Dependency Static Compilation**: Zig compiles directly to a single, dependency-free native binary, guaranteeing low startup times (<5ms) and a very small file size footprint (~1-3MB).
- **Explicit Memory Allocator Control**: Zig has no implicit allocation. All memory allocations require passing an explicit `Allocator` parameter. This allows us to track, limit, and optimize memory usage deterministically.
- **Cross-Compilation Out of the Box**: Zig's toolchain natively supports compiling to other OS/CPU targets (e.g. `x86_64-linux-gnu`, `aarch64-macos`) with a single command argument.
- **Memory Safety without Runtime Overhead**: Zig provides spatial safety via slice bounds-checks, overflow checks, and strict type handling, avoiding the runtime footprint of garbage collection.

---

## 2. Value Representation: Tagged Union

For high portability, type safety, and clean implementation, we use a native Zig `union(enum)` layout to represent runtime HKD values.

```zig
const ValueType = enum(u8) {
    Null = 0x00,
    Boolean = 0x01,
    Number = 0x02,
    String = 0x03,
    Array = 0x04,
    Object = 0x05,
    Function = 0x06,
    Closure = 0x07,
    Native = 0x08,
};

const Value = union(ValueType) {
    Null: void,
    Boolean: bool,
    Number: f64,
    String: *HkdString,
    Array: *HkdArray,
    Object: *HkdObject,
    Function: *HkdFunction,
    Closure: *HkdClosure,
    Native: HkdNativeFn,
};
```

---

## 3. Memory Management

To maintain deterministic memory lifetimes and avoid complex garbage collection overhead in the initial prototype:
1. **Reference Counting (RC)**: Heap-allocated structures (`HkdString`, `HkdArray`, `HkdObject`, `HkdClosure`) contain a `ref_count: usize` field.
2. **Allocation**: When a new heap structure is created, its reference count is set to 1.
3. **Retain/Release**: When stack slots or variable bindings duplicate or drop values, reference counters are adjusted. When a reference count hits 0, the object and its nested children are recursively freed.
4. **Circular References (Limitation)**: Cyclic graphs (e.g., an array containing itself) will leak memory in this phase. This is documented and will be addressed in a subsequent generational garbage collection phase.

---

## 4. VM Dispatch Loop

The execution core uses a standard `switch` dispatch loop over the byte array:

```zig
pub fn execute(self: *VM) !void {
    while (self.ip < self.chunk.code.len) {
        const opcode = @intToEnum(Opcode, self.readByte());
        switch (opcode) {
            .LoadConst => {
                const const_idx = self.readU16();
                const val = self.chunk.constants[const_idx];
                self.push(val);
            },
            // ...
        }
    }
}
```

This ensures full portability across all target compilers and platforms.
