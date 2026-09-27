# HKD Debug Adapter Protocol (DAP) Specification

## 1. Protocol Architecture

The HKD Debug Adapter (`hkd dap`) provides a standards-compliant implementation of the Debug Adapter Protocol (DAP) over standard I/O streams using JSON-RPC framing (`Content-Length: <n>\r\n\r\n<json>`).

```text
Editor (VS Code) ──[DAP / stdio]──> HKD Debug Adapter ──[VmDebugger]──> HKD Virtual Machine
```

---

## 2. Supported Requests & Capabilities

| Request | Implemented | Behavior |
| :--- | :--- | :--- |
| `initialize` | **Yes** | Returns `supportsConfigurationDoneRequest`, `supportsConditionalBreakpoints` |
| `launch` | **Yes** | Compiles target `.hkd` file and attaches `VmDebugger` to execution loop |
| `setBreakpoints` | **Yes** | Sets verified source line breakpoints |
| `configurationDone` | **Yes** | Commences execution up to first breakpoint or completion |
| `threads` | **Yes** | Returns thread 1 (`"HKD Main Thread"`) |
| `stackTrace` | **Yes** | Returns active call stack frames with exact lines and function names |
| `scopes` | **Yes** | Returns `Locals` and `Globals` variable scope handles |
| `variables` | **Yes** | Resolves stack slot values and globals with type formatting |
| `continue` | **Yes** | Resumes execution past current breakpoint |
| `next` | **Yes** | Steps over current statement at call depth |
| `stepIn` | **Yes** | Steps into function call |
| `stepOut` | **Yes** | Steps out to caller frame |
| `evaluate` | **Yes** | Evaluates variables or arithmetic expressions in current frame |
| `disconnect` | **Yes** | Halts VM execution and emits `terminated` event |

---

## 3. Events Emitted

* `initialized`: Sent following `initialize` response.
* `stopped`: Dispatched when execution pauses on `reason: "breakpoint" | "step" | "entry"`.
* `continued`: Dispatched when execution resumes.
* `terminated`: Dispatched when execution completes or is aborted.
* `exited`: Dispatched with `exitCode`.
