# HKD Language Server Protocol (LSP) Specification

The HKD language server implements a subset of the Microsoft Language Server Protocol to provide IDE and editor integrations.

---

## 1. Capabilities

* **`textDocument/didOpen`** / **`textDocument/didChange`**: Full text document synchronization. Computes syntax and semantic diagnostics immediately using the HKD lexer, parser, and semantic analyzer, publishing diagnostics back via `textDocument/publishDiagnostics`.
* **`textDocument/hover`**: Returns documentation tooltips for keywords, built-in functions (`print`, `assert`, etc.), and types.
* **`textDocument/definition`**: Resolves variable, function, and structure references to their respective declaration locations within the document.

---

## 2. Launching the Server

The server communicates via standard I/O (stdin/stdout) using JSON-RPC. It can be started using Node:

```bash
node dist/lsp/server.js
```
