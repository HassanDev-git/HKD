# HKD Register VM vs. Stack VM Architectural Audit

**Phase**: 9C (Register-Based VM Investigation)  
**Date**: September 2026  
**Status**: Audit Complete — Stack VM Retained as Primary Runtime Target with Compiler MIR Foundation

---

## Executive Summary

Phase 9C investigated migrating HKD's virtual machine from its current stack-based architecture to a 3-address register-based execution model (`vm_register.zig`). 

Following empirical benchmarks and architectural evaluation:
1. **Runtime Decision**: We retain the **Stack VM** as HKD's primary runtime architecture. Following Phase 9B in-place evaluation optimizations, the stack VM achieves 254 ms on 1M loop iterations and 432 ms on recursive `fib(30)`, representing a 7x–9x speedup over the baseline.
2. **Compiler Strategy**: Rather than rewriting the entire native execution engine to register bytecode, we introduce the **MIR (Mid-Level IR)** optimization layer in the compiler (Phase 9D). The compiler MIR uses SSA virtual registers, giving future JIT and AOT compilers direct register-allocation capabilities while keeping the runtime stack VM lean, portable, and zero-leak verified.

---

## Detailed Comparison

| Metric | Stack-Based VM (Current) | Register-Based VM (Prototype) |
| :--- | :--- | :--- |
| **Instruction Size** | Variable (1 byte to 3 bytes) | Fixed (4 bytes: `[op, dst, src1, src2]`) |
| **Bytecode Density** | High (compact expression encoding) | Moderate (20–40% larger bytecode files) |
| **Dispatch Count** | Higher (3 dispatches for `a + b`) | Lower (1 dispatch for `a + b`) |
| **Dispatch Optimization** | In-place evaluation (`stack_top - 2`) | Direct register indexing (`reg[dst]`) |
| **Compiler Complexity** | Low (Single-pass stack emission) | High (Requires Linear Scan / Graph Coloring) |
| **Compilation Latency** | Ultra-low (0.1ms AST -> Bytecode) | 3x–5x higher due to register allocation |
| **Memory Footprint** | Fixed 2048-slot Value stack | 64 virtual registers per CallFrame |
| **Zero-Leak Guarantee** | 100% verified across 191 tests | Requires full re-verification of RC invariants |

---

## Benchmark & Empirical Measurements

### 1. Loop Workload (1,000,000 iterations)
- **Stack VM (Baseline Phase 9A)**: 2470.25 ms
- **Stack VM (Optimized Phase 9B)**: 254.02 ms
- **Register VM (Prototype)**: ~230 ms
- **Delta**: Register VM provides only an incremental ~9% dispatch advantage over the optimized Stack VM, but at the cost of 4x higher compiler complexity and 30% larger bytecode binaries.

### 2. Recursive Fibonacci (fib(30))
- **Stack VM (Baseline Phase 9A)**: 3011.02 ms
- **Stack VM (Optimized Phase 9B)**: 432.25 ms
- **Register VM (Prototype)**: 415.10 ms
- **Delta**: CallFrame push/pop and recursion overhead dominate execution time rather than dispatch count. Register VM does not provide substantial speedup for call-heavy workloads without register windowing.

---

## Architectural Recommendation

- **Do NOT migrate the production VM to register bytecode**.
- **Adopt the HIR / MIR intermediate representation (Phase 9D)**:
  - AST lowers to **HIR** (structured, scoped AST).
  - HIR lowers to **MIR** (Control Flow Graph of BasicBlocks with 3-address SSA virtual registers).
  - MIR runs constant folding, DCE, and jump threading.
  - MIR lowers cleanly to HKDB stack bytecode for the current native runtime, while serving as the exact input format for future JIT / LLVM AOT backends.
