# HKD Developer Experience & Tooling Guide

## 1. Vision & Philosophy

HKD's developer experience is built on four core principles:
1. **Immediate Feedback**: Fast compiler diagnostics, sub-100ms completions, and instantaneous formatting.
2. **Deterministic Tooling**: Formatting, linting, building, and package resolution behave identically across editor extensions, local terminals, and CI environments.
3. **No Mocks or Placeholders**: Every feature in the editor directly communicates with real compiler and runtime infrastructure.
4. **Safety by Default**: Safe semantic refactoring, strict path sanitization, and sandboxed package installations.

---

## 2. Integrated Tooling Suite

| Tool | CLI Command | Editor / LSP Equivalent | Source Implementation |
| :--- | :--- | :--- | :--- |
| **Language Server** | `hkd lsp` | Real-time IntelliSense | `src/lsp/` |
| **Debugger** | `hkd dap` | VS Code Breakpoints/Stepping | `src/debug/`, `src/vm/` |
| **Formatter** | `hkd fmt` | Format Document (`F8`) | `src/formatter/` |
| **Linter** | `hkd lint` | Editor Problems Panel | `src/linter/` |
| **Test Runner** | `hkd test` | VS Code Test Explorer | `src/cli/test-runner.ts` |
| **Diagnostic Doctor** | `hkd doctor` | HKD: Doctor Command | `src/cli/doctor.ts` |
| **Package Manager** | `hkd add` / `install`| Package Import Completion | `src/package-manager/` |
| **Profiler** | `hkd profile` | Profile Viewers | `native-runtime/src/profiler/` |
| **Reproducibility** | `hkd build --verify-reproducible` | Build Tasks | `src/package-manager/reproducible.ts` |
