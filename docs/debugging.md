# HKD Debugging Architecture & Debug Adapter Protocol (DAP)

## 1. Overview

HKD implements a genuine Debug Adapter Protocol (DAP) server (`hkd dap`) enabling rich graphical and command-line debugging directly from VS Code.

```text
VS Code Debug Interface
         │
         ▼ (DAP JSON-RPC over stdin/stdout)
HKD Debug Adapter Server (src/debug/server.ts)
         │
         ▼
HKD Debug Session (src/debug/debug-session.ts)
         │
         ▼
HKD VM Debug Controller (src/vm/vm.ts)
 - Breakpoints (file, line, condition)
 - Stepping Engine (Step In, Step Over, Step Out)
 - Frame Introspection (Call stack, Locals, Globals)
 - Safe Expression Evaluation
```

---

## 2. DAP Lifecycle & Command Sequence

1. **`initialize`**: Advertises supported debug capabilities:
   * `supportsConfigurationDoneRequest: true`
   * `supportsConditionalBreakpoints: true`
   * `supportsEvaluateForHovers: true`
   * `supportsStepBack: false`
2. **`launch`**: Spawns or initializes the target script with debug hooks enabled.
3. **`setBreakpoints`**: Sets verified source line breakpoints, translating file path and line numbers to VM instruction addresses via the parallel `Chunk.lines` map.
4. **`configurationDone`**: Resumes VM execution from entrypoint until a breakpoint or exception is hit.
5. **`stopped` Event**: Dispatched when execution pauses at a breakpoint, step boundary, or uncaught panic:
   * Provides `threadId`, `reason: "breakpoint" | "step" | "exception"`.
6. **`stackTrace`**: Returns hierarchical call stack frames (`CallFrame`) containing function name, source path, line, and column.
7. **`scopes`**: Returns `Locals` and `Globals` variable scope handles.
8. **`variables`**: Expands variables, displaying types, values, structure fields, and array elements.
9. **`continue`, `next`, `stepIn`, `stepOut`**: Stepping control mapped to source statement boundaries.
10. **`evaluate`**: Executes expressions in the current frame context without compromising runtime safety.
11. **`disconnect`**: Terminates the debug process and cleans up resources.

---

## 3. JIT & Native Debugging Mode

When debugging, the runtime automatically operates in debug-compatible mode (Tier 0 Stack VM or hot deoptimization to VM frames upon breakpoint entry). This ensures:
* 100% accurate variable inspection at exact source statement boundaries.
* Zero compiler optimization artifacts obscuring variable states.
* Immediate, transparent deoptimization when stepping through hot code paths.
