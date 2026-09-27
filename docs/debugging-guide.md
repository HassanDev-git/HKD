# HKD Debugging & Diagnostic Guide

HKD provides multiple complementary debugging tools:
1. **Interactive REPL** (`hkd repl`)
2. **Compiler Error Explanations** (`hkd explain`)
3. **Debug Adapter Protocol** (DAP server for VS Code & Neovim)
4. **Execution Profiles & Memory Audits**

---

## 1. Compiler Error Explanations

HKD error messages feature distinct error codes (e.g., `E201`, `E301`). To receive an in-depth breakdown of what caused an error and how to fix it:

```bash
hkd explain E201
```

Output:
```text
=== HKD Error Explanation: E201 ===
Type: TypeMismatchError

Description:
  An expression was evaluated where a different type was expected by the compiler.
  HKD enforces strict type safety without implicit narrowing or conversions.

Fix:
  Ensure explicit conversion functions are called, e.g. `to_string(n)` or matching return types.
```

---

## 2. Interactive REPL

Start a live evaluation session:

```bash
hkd repl
# Or in Edition 2027:
hkd repl --edition 2027
```

Supports multiline blocks, expressions, and immediate inspection of variable values.

---

## 3. Debug Adapter Protocol (DAP)

HKD ships with a DAP 2.0 compliant server located in `src/debug/server.ts` for step debugging in editors such as VS Code.

### Launching the DAP Server
```bash
hkd dap
```

### Capabilities
- **Breakpoints**: Set line and conditional breakpoints.
- **Stepping**: Step over, step into, step out.
- **Stack Traces**: Inspect stack frames across module boundaries and async tasks.
- **Variable Inspection**: Scope view for local, closure, and global bindings.

---

## 4. Diagnostics & System Health

Run `hkd doctor` to inspect the full toolchain status:

```bash
hkd doctor
```

Checks:
- Compiler binary version and location
- Runtime executable and Zig toolchain
- Language Server Protocol (LSP) availability
- Package cache write permissions and integrity
