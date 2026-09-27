# HKD Native Code Backend Evaluation & Selection

This document presents the architectural investigation, evaluation, and selection of the native machine code generation backend for HKD Phase 10.

---

## 1. Evaluated Backends

Four primary backend strategies were evaluated against the design criteria of the HKD language ecosystem:

1. **LLVM (libLLVM / LLVM C-API)**
2. **Cranelift (Wasmtime / Bytecode Alliance)**
3. **Embedded Zig Native Backend / C-Transpiler (AOT)**
4. **Lightweight Custom Machine-Code Emitter (JIT Engine)**

---

## 2. Comparative Evaluation Matrix

| Evaluation Criteria | LLVM Backend | Cranelift Backend | Zig AOT Backend | Custom x86_64/ARM64 Emitter |
| :--- | :--- | :--- | :--- | :--- |
| **Windows x86_64 Support** | Excellent | Good (via MSVC/MinGW) | Native / Built-in | Native (Direct Win64 ABI) |
| **Linux x86_64 Support** | Excellent | Excellent | Native / Built-in | Native (Direct SysV AMD64) |
| **macOS ARM64 Support** | Excellent | Excellent | Native / Built-in | Supported / Fallback to VM |
| **Binary Footprint Overhead**| **+40 MB – 100 MB** | **+15 MB – 25 MB** | **0 MB** (Reuses toolchain) | **< 100 KB** |
| **Cold Startup Overhead** | High (50–100 ms) | Moderate (15–30 ms) | Instant (< 5 ms) | Sub-millisecond (< 0.5 ms) |
| **JIT Compilation Latency** | Very High (10–50 ms/fn)| Low (1–3 ms/fn) | N/A (AOT only) | **Ultra-Low (< 0.1 ms/fn)** |
| **Runtime Code Quality** | Peak (O3 Auto-vectorized)| High (Wasm/SSA target)| Peak (LLVM/Zig backend)| High (Direct CPU opcodes) |
| **External Dependencies** | libLLVM, cmake, python | Cargo, Rust toolchain | None (built-in Zig) | **Zero External Dependencies** |
| **Licensing** | Apache 2.0 with LLVM | Apache 2.0 | MIT | **MIT** |
| **Maintenance Burden** | Extremely High | Moderate to High | Low | **Low & Self-Contained** |

---

## 3. In-Depth Analysis of Options

### 3.1 LLVM
* **Pros**: Produces world-class optimized native assembly; supports every conceivable CPU architecture and vector extension.
* **Cons**: Massive distribution footprint. Adding `libLLVM` would balloon HKD's native binary from **1.05 MB to over 60 MB**. Furthermore, compilation latency per function would introduce noticeable stutter on hot JIT compilation, defeating HKD's goal of lightweight, instantaneous execution.

### 3.2 Cranelift
* **Pros**: Designed specifically for fast JIT compilation; clean SSA-based IR.
* **Cons**: Requires bundling a large Rust shared library or static crate, requiring a Rust toolchain in HKD's build pipeline and adding 15+ MB of static code.

### 3.3 Custom Lightweight Machine-Code Emitter (Selected for JIT)
* **Pros**:
  * **Zero External Dependencies**: Implemented in under 1,000 lines of pure Zig in `native-runtime/src/jit/x86_64.zig`.
  * **Near-Zero Binary Footprint**: Adds less than 100 KB to the `hkd-runtime.exe` binary.
  * **Instant JIT Compilation**: Generates machine code in **microseconds**, eliminating JIT warmup stutter.
  * **Strict Security**: Manages executable buffers using operating system primitives (`VirtualAlloc`/`VirtualProtect` on Windows; `mmap`/`mprotect` on POSIX) enforcing strict W^X.

### 3.4 Zig Native Compiler Backend (Selected for AOT)
* **Pros**:
  * For whole-program Ahead-Of-Time compilation (`hkd build --native`), HKD already has a built-in cross-compiling Zig compiler (`@zigc/cli`).
  * Emits optimized native executables across Windows, Linux, and macOS without distributing heavy development SDKs to end users.

---

## 4. Final Architectural Selection

HKD Phase 10 adopts a **Dual-Engine Native Architecture**:

1. **JIT Engine**: **Custom Lightweight x86_64 Emitter** in `native-runtime/src/jit/x86_64.zig`.
   * Directly lowers hot MIR functions to native machine code in W^X memory.
   * Delivers sub-millisecond JIT compilation latency with zero external dependencies.
2. **AOT Engine**: **Whole-Program Native Compiler** via Zig Native Backend.
   * Compiles complete programs ahead-of-time into standalone stripped binaries.
3. **Safety Fallback**: **Native Stack VM**.
   * Remains the universal correctness baseline for non-x86_64 platforms and dynamic features.
