# HKD Native Code Generation, JIT/AOT & Optimizing Compiler Architecture

This document specifies the technical architecture for **HKD Phase 10: Native Code Generation, JIT/AOT & Optimizing Compiler 3.0**.

---

## 1. Current Compiler Pipeline

The HKD compilation and execution pipeline operates across high-level AST, intermediate representations, bytecode, and native execution:

```text
Source Code (.hkd)
       │
       ▼
Lexer (Token Stream)
       │
       ▼
Parser (AST)
       │
       ▼
Semantic Analyser (Symbol Table, Scope Verification)
       │
       ▼
HIR (High-Level Intermediate Representation)
       │
       ▼
SSA-Ready MIR (Control Flow Graph, BasicBlocks, Virtual Registers, PHI/Block Arguments)
       │
       ▼
Optimization Pipeline 2.0 (Constant/Copy Prop, Algebraic Simplify, DCE, CSE)
       │
 ┌─────┴───────────────────────────────┬───────────────────────────────┐
 │                                     │                               │
 ▼                                     ▼                               ▼
Stack VM Bytecode Emitter        JIT Compiler (Hot Functions)     AOT Compiler (Whole Program)
 │                                     │                               │
 ▼                                     ▼                               ▼
.hkdb Binary Chunk               Native x86_64 Machine Code       Native Executable Binary
 │                                     │                               │
 ▼                                     ▼                               ▼
Native Stack VM (Fallback)        W^X Executable Memory Page       Host OS Process Execution
```

---

## 2. Current MIR Representation

The Middle Intermediate Representation (MIR) represents computation as a Control Flow Graph (CFG) of `BasicBlock`s using 3-address virtual register instructions (`VReg`):

* **Operand Types**:
  * `Reg`: Virtual register identifier (`VReg`).
  * `Const`: Compile-time constant (numbers, strings, booleans, null).
* **Instruction Classes**:
  * `Const`: Load constant into virtual register.
  * `Copy`: Move register or constant into destination register.
  * `BinOp`: Binary operation (`+`, `-`, `*`, `/`, `%`, `<`, `>`, `==`, etc.).
  * `UnaryOp`: Unary operation (`-`, `!`).
  * `LoadLocal` / `StoreLocal`: Local stack slot access.
  * `LoadGlobal` / `StoreGlobal`: Global environment access.
  * `Call`: Function invocation with argument vector.
  * `GetField` / `SetField`: Object property access.
* **Terminators**:
  * `Branch`: Unconditional jump to target basic block.
  * `CondBranch`: Conditional jump based on operand.
  * `Return`: Return control and optional value to caller.

In Phase 10B, this representation is augmented with **SSA-versioned virtual registers**, **Block Parameters / PHI nodes**, and explicit **dominance / edge metadata**.

---

## 3. Native Lowering Strategy

HKD preserves the Stack VM as the ultimate correctness baseline. When lowering MIR to native machine code:

1. **Pure Compute Fast-Path**:
   * Functions or basic blocks dominated by numeric calculations (integers, floats), local variable updates, simple comparisons, and direct recursion are lowered directly to native CPU instructions (`add`, `sub`, `imul`, `cmp`, `jmp`, `call`, `ret`).
2. **Runtime Services Lowering**:
   * Operations requiring heap management, string allocations, array resizing, or dynamic property lookup are lowered to calls into the stable **Runtime ABI** (`runtime_alloc`, `runtime_get_field`, etc.).
3. **Unsupported Construct Fallback**:
   * If a function contains language constructs not yet supported by native code generation (e.g. dynamic eval, complex closures with escaped mutable upvalues, unspecialized reflections), the compiler flags the function and routes execution to the Stack VM.

---

## 4. Calling Conventions

To achieve maximum native interoperability without translation layers:

### 4.1 Windows x86_64 Calling Convention
* **Integer / Pointer Arguments**: `RCX`, `RDX`, `R8`, `R9`.
* **Floating-Point Arguments**: `XMM0`, `XMM1`, `XMM2`, `XMM3`.
* **Return Value**: `RAX` (integer/pointer) or `XMM0` (float).
* **Shadow Space**: 32 bytes allocated by the caller immediately above the return address (`sub rsp, 32`).
* **Non-Volatile (Callee-Saved) Registers**: `RBX`, `RBP`, `RDI`, `RSI`, `R12`, `R13`, `R14`, `R15`, `XMM6`-`XMM15`.
* **Stack Alignment**: 16-byte alignment before issuing a `call` instruction (`RSP % 16 == 0`).

### 4.2 System V AMD64 Calling Convention (Linux & macOS x86_64)
* **Integer / Pointer Arguments**: `RDI`, `RSI`, `RDX`, `RCX`, `R8`, `R9`.
* **Floating-Point Arguments**: `XMM0` - `XMM7`.
* **Return Value**: `RAX` or `XMM0`.
* **Non-Volatile Registers**: `RBX`, `RBP`, `R12`, `R13`, `R14`, `R15`.
* **Stack Alignment**: 16-byte alignment.

The native code generator maintains platform abstraction profiles to emit calling sequence instructions matching the host OS.

---

## 5. Runtime ABI

Complex operations are mediated via C-ABI entrypoints exposed by `native-runtime/src/jit/runtime_abi.zig`:

```c
// Memory & Object Management
void*   runtime_alloc(size_t size);
void    runtime_retain(Value val);
void    runtime_release(Value val);

// Property & Array Access
Value   runtime_get_field(Value obj, const char* field);
void    runtime_set_field(Value obj, const char* field, Value val);
Value   runtime_array_get(Value arr, int64_t index);
void    runtime_array_set(Value arr, int64_t index, Value val);
void    runtime_array_push(Value arr, Value val);

// String Operations
Value   runtime_string_concat(Value a, Value b);

// Dynamic Invocations & Deoptimization
Value   runtime_call(Value callee, int argc, Value* args);
void    runtime_deoptimize(uint64_t func_id, uint32_t bblock_id, void* register_state);
```

---

## 6. Value ABI & Unboxing

* **Unboxed Primitives**:
  * Pure 64-bit integers and floating-point values reside directly in hardware registers (`RAX`, `RDX`, `XMM0`, etc.) within native functions.
* **Boxed `Value` Structure**:
  * When interacting with the runtime ABI or returning to the VM, values use the canonical 16-byte tagged union representation:
    ```zig
    pub const Value = union(enum) {
        Null,
        Boolean: bool,
        Number: f64,
        String: *HkdString,
        Array: *HkdArray,
        Object: *HkdObject,
        Function: *HkdFunction,
        Closure: *HkdClosure,
        Native: *const fn (std.mem.Allocator, []const Value) anyerror!Value,
        ...
    };
    ```

---

## 7. GC & Reference Counting Ownership

* **Callee/Caller Ownership**:
  * Native code adheres to the same reference ownership invariants as the Stack VM:
    * Arguments passed to native functions are **borrowed** by default.
    * Values stored into arrays, objects, or global state must be explicitly **retained** (`runtime_retain`).
    * Overwritten values or dead local heap references must be **released** (`runtime_release`).
* **Zero Leak Invariant**:
  * All temporary objects allocated inside native fast-paths must be released prior to function return.
  * Verified via `TrackingAllocator` during testing and benchmarking.

---

## 8. Deoptimization & Fallback Strategy

Dynamic languages require assumptions (e.g., that an operand is an integer, or that an object has not changed shape).

```text
       Native Code Path
              │
              ▼
   Type / Shape Guard Check
         ┌────┴────┐
         │         │
      [Pass]    [Fail]
         │         │
         │         ▼
         │   Capture Register State
         │   (VRegs -> Stack Values)
         │         │
         │         ▼
         │   Restore CallFrame IP
         │         │
         │         ▼
         │   Resume Execution in
         │   Native Stack VM
         ▼
Continue Fast Native
```

* **Guard Failures**:
  * Emit jump to deoptimization stub.
  * Stub marshals CPU register state back into the VM's active `ExecutionContext` stack slots.
  * Control transfers back to `vm.execute()` at the corresponding bytecode offset.

---

## 9. JIT Architecture

* **Hotness Counters**:
  * Every function invocation in the Stack VM increments an invocation counter (`func.call_count`).
  * When `func.call_count >= HKD_JIT_THRESHOLD` (default: 50 calls):
    1. Function MIR is extracted or synthesized.
    2. Optimizer passes (Constant Folding, DCE, Copy Prop) run.
    3. Native x86_64 machine code generator emits bytes into a writable buffer.
    4. Memory protection transitions from `PAGE_READWRITE` to `PAGE_EXECUTE_READ` (W^X security).
    5. Native function pointer is cached in `func.native_code`.
    6. Future calls jump directly to `func.native_code`.

---

## 10. AOT Architecture

* `hkd build --native`:
  1. Parses and analyses all project source modules.
  2. Builds whole-program MIR.
  3. Applies inter-procedural optimizations.
  4. Generates a standalone C/Zig harness or object file embedding the compiled native machine code and runtime ABI.
  5. Links into a standalone, libc-free native executable (`.exe` on Windows, ELF on Linux, Mach-O on macOS).
  6. The resulting executable starts instantaneously without runtime compilation overhead.
