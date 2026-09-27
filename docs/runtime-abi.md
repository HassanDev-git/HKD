# HKD 1.0.0 Native Runtime ABI Specification

## 1. Value Representation (Tagged Union)
In the native Zig runtime, every dynamic value is represented by an 8-byte aligned tagged union (`Value`):

```zig
pub const Value = union(enum) {
    Null,
    Boolean: bool,
    Number: f64,
    String: *HkdString,
    Array: *HkdArray,
    Object: *HkdObject,
    Closure: *HkdClosure,
    Native: *const fn (allocator: Allocator, args: []const Value) anyerror!Value,
};
```

---

## 2. Memory Ownership & ARC
Heap-allocated structures (`HkdString`, `HkdArray`, `HkdObject`, `HkdClosure`) contain an intrusive 32-bit reference count:

```zig
pub fn retain(val: Value) void {
    // Increments ref count if heap pointer
}

pub fn release(allocator: Allocator, val: Value) void {
    // Decrements ref count; frees recursively when ref count == 0
}
```

---

## 3. C-ABI & FFI Calling Convention
Native functions invoked via the FFI layer conform to standard platform calling conventions (Microsoft x64 ABI on Windows, System V AMD64 ABI on Linux and macOS).
Pointers passed across FFI boundaries are guaranteed pinned for the duration of the external call.
