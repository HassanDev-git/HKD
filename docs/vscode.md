# HKD VS Code Extension Guide

## 1. Overview

The official HKD VS Code extension provides end-to-end tooling for HKD development:
* High-speed syntax highlighting and semantic token coloring
* Full Language Server Protocol 2.0 integration
* Native Debug Adapter Protocol (DAP) integration
* Test Explorer integration for automated test discovery and execution
* Problem matchers and build tasks
* Package intelligence and workspace management

---

## 2. Configuration Settings

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `hkd.lsp.enable` | `boolean` | `true` | Enable or disable HKD Language Server |
| `hkd.lsp.path` | `string` | `""` | Custom path to the `hkd` binary or LSP server script |
| `hkd.format.enable` | `boolean` | `true` | Enable document formatting on save |
| `hkd.lint.enable` | `boolean` | `true` | Enable background linting diagnostics |
| `hkd.debug.mode` | `string` | `"auto"` | Debugger mode: `"auto"`, `"vm"`, or `"native"` |

---

## 3. Extension Commands

* `HKD: Restart Language Server`: Restarts the LSP process and re-indexes the project graph.
* `HKD: Run File`: Executes the active `.hkd` source file.
* `HKD: Debug File`: Launches a full DAP debug session for the active file.
* `HKD: Profile File`: Runs profiling telemetry and shows function hotness and metrics.
* `HKD: Format Document`: Formats active document using the authoritative HKD formatter.
* `HKD: Doctor`: Runs the complete system diagnostic (`hkd doctor`).
* `HKD: Install Dependencies`: Installs project packages and synchronizes `hkd.lock`.

---

## 4. Debugging with VS Code (`launch.json`)

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "hkd-debug",
      "request": "launch",
      "name": "Debug HKD Program",
      "program": "${file}",
      "stopOnEntry": false
    }
  ]
}
```
