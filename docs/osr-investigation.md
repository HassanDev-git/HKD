# HKD Phase 11 — On-Stack Replacement (OSR) Investigation & State Transfer

## 1. Motivation & Problem Statement

In standard function-level JIT tiering (Tier 0 Stack VM $\to$ Tier 1 Baseline JIT $\to$ Tier 2 Optimizing JIT), hotness counters increment exclusively at function invocation boundaries.

While this works well for frequently called short functions, it creates an execution stall for programs with **long-running compute loops** within a single function invocation:

```hkd
fn computePi() {
    let sum = 0.0;
    for (let i = 0; i < 50000000; i = i + 1) {
        // This loop executes 50 million iterations in Tier 0
        // because computePi() is invoked only once!
        sum = sum + step(i);
    }
    return sum;
}
```

Without On-Stack Replacement (OSR), `computePi` will execute all 50 million iterations in the Tier 0 interpreter/Stack VM, never triggering native JIT compilation until the loop finishes and returns.

---

## 2. OSR Architecture & Trigger Mechanism

OSR enables transitioning an active stack frame from Tier 0 (Stack VM) directly into Tier 1 or Tier 2 native machine code **at a loop back-edge**, mid-execution.

```text
    ┌───────────────────────────┐
    │  Tier 0: Stack VM Loop   │
    └─────────────┬─────────────┘
                  │ Back-edge jump counter >= 1,000
                  ▼
    ┌───────────────────────────┐
    │   Trigger OSR Compiler    │
    └─────────────┬─────────────┘
                  │ Compile Loop Body to Native Code
                  ▼
    ┌───────────────────────────┐
    │  Frame State Extraction   │
    │ (locals, stack, loop idx) │
    └─────────────┬─────────────┘
                  │ Map Slots -> Native CPU Registers / Stack
                  ▼
    ┌───────────────────────────┐
    │  Resume at OSR Entrypoint │
    │   (Native x86_64 Code)    │
    └─────────────┬─────────────┘
                  │ On loop exit or guard failure
                  ▼
    ┌───────────────────────────┐
    │     Deoptimize to VM      │
    └───────────────────────────┘
```

### 2.1 Trigger Heuristic
- The Stack VM tracks backward branch executions via `vm.backward_jump_counts`.
- When a backward jump at instruction pointer `ip` exceeds `osr_threshold = 1000`, the VM suspends bytecode dispatch and signals `jit_manager.compileOSR(frame, ip)`.

---

## 3. Execution State Transfer & Frame Reconstruction

When entering native code mid-loop, the native code cannot execute the normal function prologue because the caller did not invoke it via the standard native calling convention (`callq`).

Instead, the runtime performs **Frame Reconstruction**:

### 3.1 State Mapping:
1. **Locals**: Stack VM `frame.slots[0..local_count]` are copied into allocated spill slots and assigned registers:
   - Slot 0 $\to$ `RAX` / `RCX`
   - Slot 1 $\to$ `RDX`
   - Remaining slots $\to$ Stack Frame Spill Area
2. **Loop Induction Variables**: Extracted directly from the local slot corresponding to the induction variable.
3. **Operand Stack**: In well-formed bytecode at loop back-edges, the evaluation stack height is guaranteed to be zero (or invariant).

### 3.2 OSR Re-Entry Stub:
The JIT compiler emits an **OSR Entry Stub**:
```nasm
; OSR Entry Stub
push rbp
mov rbp, rsp
sub rsp, 64                     ; Allocate spill storage
mov rax, [rsi + 0]              ; Load local 0 from VM frame
mov rdx, [rsi + 8]              ; Load local 1 from VM frame
jmp osr_loop_header             ; Jump directly to compiled loop body
```

---

## 4. Deoptimization Recovery from OSR

If an assumption fails during native loop execution (e.g. an array access goes out of bounds, or an integer overflows into a float):

1. **Native Guard Failure**: Triggers deoptimization bailout.
2. **State Spill**: Current register values (`RAX`, `RDX`, etc.) are written back into a temporary `DeoptRecord` buffer.
3. **VM Frame Resumption**: The Stack VM copies values back into `frame.slots` and sets `frame.ip` to the bytecode instruction corresponding to the failed guard.
4. **Execution Continues**: Execution resumes safely in the Tier 0 interpreter without any user-observable side effects.

---

## 5. Summary & Recommendation

| Strategy | Latency | Memory Overhead | Effectiveness on Long Loops |
| :--- | :--- | :--- | :--- |
| **Pure Function JIT** | Low | Low | Poor on single-invocation long loops |
| **Function Inlining + JIT** | Medium | Medium | Excellent when loop is factored into functions |
| **Full OSR** | Higher | Higher | Maximum performance on monolithic loops |

HKD Phase 11 implements the foundation for OSR through loop back-edge profiling (`vm.recordLoop`), hot loop detection, and safe deoptimization fallbacks, providing a seamless path toward fully autonomous mid-loop native execution.
