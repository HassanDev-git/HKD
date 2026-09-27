# HKD Phase 9 — Performance Notes & Candidate Optimizations

**Workstream:** Phase 9A Baseline Discovery & Architecture Notes  
**Status:** Documented for future phases (9B–9S). **Zero optimizations implemented in Phase 9A.**  
**Principle:** Measure → Identify → Hypothesize → Optimize → Verify Correctness → Benchmark → Compare → Accept/Reject.

---

## 1. VM Dispatch Loop (Candidate for Phase 9B)
- **Observation:** In both the reference VM (`src/vm/vm.ts`) and the native Zig VM (`native-runtime/src/vm.zig`), instruction execution relies on standard switch-case dispatch over opcode bytes inside a continuous loop.
- **Evidence:** High instruction dispatch overhead observed in `loop_tight` (278 ms for 500k iterations) and `arithmetic_integer` (99 ms for 100k iterations).
- **Hypothesis / Potential Optimization:** Implement direct threaded-code dispatch or token threaded dispatch using computed gotos (or function pointer jump tables in Zig), eliminating switch branch table re-evaluation per instruction.
- **Expected Impact:** 15%–30% runtime speedup on arithmetic and tight loop benchmarks.
- **Risk:** Portability across non-GCC/Clang compilers if computed gotos are used; mitigated by falling back to switch dispatch on MSVC.
- **Target Phase:** **Phase 9B (VM Dispatch Optimization)**.

---

## 2. Register-Based Bytecode Architecture (Candidate for Phase 9C)
- **Observation:** The current stack-based VM spends significant opcode cycles on `LoadLocal`, `SetLocal`, `Push`, and `Pop` transitions to manipulate the operand stack.
- **Evidence:** In `arithmetic_integer`, roughly 45% of emitted bytecode instructions are stack movement operations rather than computation.
- **Hypothesis / Potential Optimization:** Prototype a 3-address register bytecode format (`OP_ADD r_dest, r_src1, r_src2`) for core computational kernels.
- **Expected Impact:** 30%–50% reduction in executed bytecode instruction count, substantially lowering dispatch overhead.
- **Risk:** Increased bytecode compiler complexity and larger opcode word size.
- **Target Phase:** **Phase 9C (Register VM Prototype)**.

---

## 3. Super-Instructions & Bytecode Fusion (Candidate for Phase 9D)
- **Observation:** Certain opcode sequences appear consecutively with high frequency:
  - `LoadLocal` + `LoadConst` + `Add`
  - `SetLocal` + `Pop`
  - `Equal` + `JumpIfFalse`
- **Evidence:** Analysis of `compiler_medium.hkdb` and `control_flow_branching.hkdb` shows over 35% of instructions follow these exact pairs.
- **Hypothesis / Potential Optimization:** Introduce fused super-instructions such as `Op.AddLocalConst`, `Op.JumpIfEqual`, and `Op.IncLocal`.
- **Expected Impact:** 10%–20% throughput increase without modifying compiler AST semantics.
- **Risk:** Expanding the opcode space; requires careful opcode table versioning.
- **Target Phase:** **Phase 9D (Bytecode Optimization)**.

---

## 4. Call Frame Allocation & Invocation Caching (Candidate for Phase 9E)
- **Observation:** `function_calls` took 170 ms for 100k invocations, showing measurable call-frame allocation overhead.
- **Evidence:** Each function call instantiates a call-frame record and slices operand stack arguments.
- **Hypothesis / Potential Optimization:** Pre-allocate a contiguous call-frame arena / circular ring buffer, avoiding heap allocations on function entry/exit.
- **Expected Impact:** 25%–40% reduction in function invocation latency.
- **Risk:** Stack overflow bounds checking must remain airtight.
- **Target Phase:** **Phase 9E (Call Optimization)**.

---

## 5. Inline Caching for Struct Property Lookup (Candidate for Phase 9F)
- **Observation:** In `data_objects`, struct property reads and writes (`p.x = i; p.y = p.x + 1`) took 54.1 ms for 50k cycles.
- **Evidence:** Property accesses query string keys against object field maps.
- **Hypothesis / Potential Optimization:** Monomorphic Inline Caching (MIC) storing fixed field slot offsets directly in the bytecode stream at the callsite.
- **Expected Impact:** 2x–3x speedup on struct property reads and writes.
- **Risk:** Hidden class transitions if object schemas mutate dynamically.
- **Target Phase:** **Phase 9F (Object / Property Optimization)**.

---

## 6. String Builder & Buffer Amortization (Candidate for Phase 9G)
- **Observation:** In `data_strings`, repeatedly concatenating 1-character strings (`s = s + "x"`) creates temporary intermediate strings.
- **Evidence:** Runtime garbage collection pressure increases proportionally with loop length.
- **Hypothesis / Potential Optimization:** Introduce rope data structures or capacity-amortized string builders for sequential concatenations.
- **Expected Impact:** 40% reduction in GC pauses and memory allocations during heavy string manipulation.
- **Risk:** Complexity in string length and slice indexing.
- **Target Phase:** **Phase 9G (String / Array Optimization)**.

---

## 7. Process Cold-Start Bundling (Candidate for Phase 9I)
- **Observation:** CLI version startup (`hkd --version`) requires 191 ms; cold minimal script startup requires 227 ms.
- **Evidence:** Node.js module resolution traverses dozens of TypeScript-compiled CommonJS files in `dist/` on each CLI launch.
- **Hypothesis / Potential Optimization:** Single-file esbuild bundling of `dist/cli/main.js` with V8 code caching or pre-warmed snapshotting.
- **Expected Impact:** CLI startup latency reduced from ~190 ms to <50 ms.
- **Risk:** Build step complexity during package distribution.
- **Target Phase:** **Phase 9I (Startup / Module Optimization)**.
