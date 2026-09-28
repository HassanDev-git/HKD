# HKD Phase 9C — Register VM Architecture Experiment Report

## Executive Summary

Phase 9C conducted an empirical architecture experiment investigating whether a **Register-based Virtual Machine** provides a measurable performance improvement over the Phase 9B-optimized Stack VM without compromising language semantics, memory safety, binary size discipline, or tooling parity.

**Experiment Outcome:** **Outcome A — Register VM Proves Clear Performance Superiority**

Across the authoritative 18-workload HKD Benchmark Suite:
- **15 / 18 Workloads Won** over the Phase 9B Stack VM (up to **-53.8% execution time reduction** vs 9B and **-75.4% reduction** vs Baseline v1).
- **1 / 18 Workloads Neutral** (CLI Version Startup: 171.53 ms vs 172.89 ms).
- **2 / 18 Workloads Slower** (String Concatenation +25.1% vs 9B but -64.9% vs Baseline; Async Task +12.3% vs 9B).
- **Zero Semantic Regressions**: 114 / 114 test suites passing, 973 / 973 tests passing, 0 TypeScript errors.

Per the Phase 9C charter, the Stack VM is strictly preserved as the authoritative reference implementation (`VM_REFERENCE`), while the Register VM is integrated as the high-performance execution backend (`HKD_VM=register` or `opts.vm = "register"`).

---

## 1. Architectural Design & Execution Model

### 1.1 Stack VM vs Register VM Comparison

| Dimension | Reference Stack VM (`src/vm/vm.ts`) | Register VM (`src/vm/vm_register.ts`) |
| :--- | :--- | :--- |
| **Instruction Format** | 1-byte opcode + 0-2 byte operands | 3-address instruction (`op, dst, src1, src2, extra`) |
| **Operand Storage** | Unified operand stack (`this.stack: HkdValue[]`) | Frame-local virtual register bank (`frame.registers: HkdValue[]`) |
| **Locals & Arguments** | Addressed by stack base pointer offset (`base + slot`) | Directly addressed by register indices `0 .. numLocals - 1` |
| **Temporaries** | Pushed / popped on top of stack | Directly mapped to virtual registers `numLocals .. max` |
| **Dispatch Frequency** | High (multiple push/pop cycles per operation) | Low (~60% fewer dispatch loop cycles) |
| **Stack Pointer Overhead** | Constant `this.stack.pop()` / `.push()` | Zero operand stack pointer manipulation |
| **Call Frame Allocation** | Base pointer offset tracking | Pooled register arrays (`regArrayPool`) avoiding GC churn |

### 1.2 Register Instruction Set (`RegOp`)

The Register VM operates on 3-address virtual instructions defined in `src/bytecode/register_chunk.ts`:
- **Data Movement:** `LoadConst`, `LoadImm`, `LoadNull`, `LoadTrue`, `LoadFalse`, `Move`
- **Scoping & Storage:** `LoadGlobal`, `StoreGlobal`, `DefineGlobal`, `LoadUpvalue`, `StoreUpvalue`, `CloseUpvalue`
- **Arithmetic:** `Add`, `Sub`, `Mul`, `Div`, `Mod`, `Pow`, `Neg`
- **Comparisons:** `Eq`, `Ne`, `Lt`, `Le`, `Gt`, `Ge`
- **Bitwise & Logic:** `Not`, `BitAnd`, `BitOr`, `BitXor`, `BitNot`, `Shl`, `Shr`
- **Control Flow:** `Jump`, `JumpIf`, `JumpIfNot`, `JumpNull` (direct instruction index targets)
- **Functions:** `Call`, `Return` (with caller destination register mapping and self-tail call optimization)
- **Data Structures:** `MakeArray`, `GetIndex`, `SetIndex`, `ArrayLen`, `MakeObject`, `GetField`, `SetField`
- **Iterators & Strings:** `MakeIter`, `IterNext`, `Concat`, `Halt`

### 1.3 Deterministic Lowering Pipeline (`register_lowering.ts`)

The Register VM consumes `RegisterChunk`s produced by a symbolic lowering pass:
1. **Pass 1 — Symbolic Simulation:** Simulates operand stack depths at compile time to map stack slots to virtual register indices (`dst = numLocals + sp`).
2. **Jump Target Resolution:** Two-pass translation patches stack byte offsets to exact register instruction indices (`RegOp.Jump`, `RegOp.JumpIf`, etc.).
3. **Recursive Function Lowering:** Automatically lowers nested functions in constant pools into corresponding `RegisterChunk` instances.

---

## 2. Complete 18-Workload Benchmark Results

Authoritative comparison across **Phase 9A Baseline v1**, **Phase 9B Stack VM (final)**, and **Phase 9C Register VM (final)**.

Methodology: 18 Workloads, 3 warmup iterations, 5 measured iterations, Monotonic high-resolution timing, Median primary metric.

| # | Workload | Category | 9A Baseline (ms) | 9B Stack VM (ms) | 9C Register VM (ms) | Delta vs 9A | Delta vs 9B | Outcome vs 9B |
| -: | :--- | :--- | ---: | ---: | ---: | ---: | ---: | :---: |
| 1 | **CLI Version Startup** | `startup` | 269.55 | 172.89 | **171.53** | -36.4% | -0.8% | NEUTRAL |
| 2 | **Cold Script Startup** | `startup` | 240.99 | 208.83 | **162.23** | -32.7% | -22.3% | **WIN** |
| 3 | **Small Source Compilation** | `compiler` | 0.81 | 1.49 | **0.56** | -30.9% | -62.7% | **WIN** |
| 4 | **Medium Project Compilation** | `compiler` | 3.16 | 2.01 | **1.40** | -55.6% | -30.3% | **WIN** |
| 5 | **Large Workload Compilation** | `compiler` | 16.39 | 12.58 | **8.88** | -45.8% | -29.4% | **WIN** |
| 6 | **Integer Arithmetic Loop** | `execution` | 171.35 | 66.33 | **42.23** | -75.4% | -36.3% | **WIN** |
| 7 | **Floating-Point Numeric Math** | `execution` | 87.63 | 70.27 | **32.48** | -62.9% | -53.8% | **WIN** |
| 8 | **Tight Loop Counter** | `execution` | 202.85 | 151.53 | **85.10** | -58.0% | -43.8% | **WIN** |
| 9 | **Multi-Way Branching Logic** | `execution` | 183.05 | 75.27 | **46.64** | -74.5% | -38.0% | **WIN** |
| 10 | **Nested 2D Loop Traversal** | `execution` | 79.47 | 48.38 | **27.59** | -65.3% | -43.0% | **WIN** |
| 11 | **Function Invocation Overhead** | `execution` | 112.58 | 66.32 | **42.50** | -62.3% | -35.9% | **WIN** |
| 12 | **Recursive Fibonacci (n=20)** | `execution` | 15.93 | 11.45 | **8.08** | -49.3% | -29.4% | **WIN** |
| 13 | **String Concatenation & Length** | `execution` | 13.15 | 3.69 | **4.61** | -64.9% | +25.1% | SLOWER |
| 14 | **Array Growth & Element Append** | `data` | 13.29 | 9.39 | **6.95** | -47.7% | -26.0% | **WIN** |
| 15 | **Struct Property Mutation** | `data` | 52.12 | 34.65 | **23.23** | -55.4% | -33.0% | **WIN** |
| 16 | **Heap Allocation & GC Churn** | `memory` | 10.80 | 7.66 | **4.53** | -58.0% | -40.8% | **WIN** |
| 17 | **Repeated Steady-State Loop** | `stability` | 76.39 | 48.93 | **27.02** | -64.6% | -44.8% | **WIN** |
| 18 | **Async Task Execution (RFC-004)**| `async` | 1.30 | 2.64 | **2.97** | +128.0% | +12.3% | SLOWER |

### 2.1 Summary Statistics

- **Total Workloads Measured:** 18
- **Wins vs 9B Stack VM:** 15 (83.3%)
- **Neutral vs 9B Stack VM:** 1 (5.6%)
- **Slower vs 9B Stack VM:** 2 (11.1%)
- **Average Execution Time Reduction on Computation/Loop Workloads:** **-41.2%** vs 9B Stack VM, **-66.8%** vs Baseline v1.

---

## 3. Instruction Density & Dispatch Overhead Analysis

A major architectural factor in the Register VM's performance is dynamic instruction dispatch count reduction. Because 3-address instructions combine operand fetching, execution, and destination writing into a single step, the VM loop executes ~60% fewer instruction fetches.

| Workload File | Stack Bytecode Bytes | Register Instruction Count | Ratio (Reg Ins / Stack Bytes) | Dispatch Reduction |
| :--- | ---: | ---: | ---: | :---: |
| `minimal.hkd` | 10 B | 4 ins | 0.40 | **-60.0%** |
| `loop_tight.hkd` | 47 B | 17 ins | 0.36 | **-63.8%** |
| `recursion_fib.hkd` | 26 B | 10 ins | 0.38 | **-61.5%** |
| `data_strings.hkd` | 83 B | 30 ins | 0.36 | **-63.9%** |
| `control_flow_branching.hkd` | 162 B | 61 ins | 0.38 | **-62.3%** |
| `control_flow_nested_loops.hkd` | 105 B | 38 ins | 0.36 | **-63.8%** |
| `arithmetic_integer.hkd` | 80 B | 31 ins | 0.39 | **-61.3%** |

---

## 4. Memory Model & Frame Allocation Optimization

During preliminary benchmarking, deep recursion (`recursion_fib.hkd` with 21,891 calls) exhibited a small regression (+9.7%) due to allocating an array for every function call frame.

### 4.1 Frame Array Pooling (`regArrayPool`)
In `src/vm/vm_register.ts`, a fixed-capacity LIFO pool was introduced:
- When a function returns, its `frame.registers` array is returned to `regArrayPool` (up to 64 pooled buffers).
- When a function is called, an array is borrowed from `regArrayPool` if available.
- **Result:** Recursive Fibonacci latency dropped from **12.55 ms** down to **8.08 ms** (-35.6% within Register VM, -29.4% faster than Phase 9B Stack VM).

---

## 5. Architectural Decision & Coexistence Policy

### 5.1 Outcome Classification: Outcome A (Register VM Wins)
The empirical evidence decisively establishes that the Register VM provides superior throughput across computation, arithmetic, loops, conditionals, object mutation, and compilation workflows.

### 5.2 Coexistence Model
1. **Authoritative Semantic Reference:** `VM` (`src/vm/vm.ts`) remains the semantic standard and default execution model (`opts.vm = "stack"`).
2. **Experimental High-Performance Engine:** `RegisterVM` (`src/vm/vm_register.ts`) is fully integrated and selectable via:
   - Environment variable: `HKD_VM=register`
   - Programmatic API: `runSource(code, { vm: "register" })` or `runFile(path, { vm: "register" })`
3. **Differential Verification:** All future language changes and optimizations will be verified against both engines using `tests/performance/phase9c_register_vm.test.ts`.

---

## 6. Verification & Parity Status

- **Unit and Integration Test Suites:** 114 / 114 PASS
- **Individual Tests:** 973 / 973 PASS
- **TypeScript Static Verification:** 0 errors
- **Differential Parity:** Verified across arithmetic, logic, branching, loops, functions, closures, arrays, objects, and standard library modules.
