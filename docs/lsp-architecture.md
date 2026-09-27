# HKD Language Server Protocol 2.0 Architecture

## 1. Executive Summary

HKD Language Server 2.0 (`hkd lsp`) transforms the HKD developer experience into an IDE-grade environment. Rather than relying on regex heuristics or synthetic mocks, the LSP server directly orchestrates the real HKD Lexer, Parser, Semantic Analyzer, Error Reporter, and Phase 12 Package Manager.

---

## 2. Server Architecture

```text
Editor (VS Code / Neovim / Helix)
              │ (JSON-RPC over stdin/stdout)
              ▼
   LSP 2.0 Transport Layer (src/lsp/protocol.ts)
              │
              ▼
   LSP Message Dispatcher & Cancellation Token Manager
              │
    ┌─────────┴───────────────┬────────────────────────┐
    ▼                         ▼                        ▼
Document Engine        Workspace Graph          Feature Handlers
(src/lsp/documents.ts) (src/lsp/workspace.ts)   (src/lsp/features.ts)
 - In-memory buffers    - Multi-package discovery - Completion & Hover
 - Incremental didChange- hkd.toml & hkd.lock    - Definition & References
 - AST & Semantic Cache - .hkd/deps & vendor     - Rename & CodeActions
 - Debounced diagnostics- Authoritative resolver - Semantic Tokens & Lens
```

---

## 3. Core Protocol Lifecycle

1. **`initialize`**: Advertises strictly verified capabilities:
   * Incremental text document synchronization (`SyncKind.Incremental = 2`)
   * Completion with trigger characters (`.`, `:`, `"`, `'`, `/`)
   * Signature Help with trigger characters (`(`, `,`)
   * Hover (`HoverProvider = true`)
   * Definition (`DefinitionProvider = true`)
   * References (`ReferencesProvider = true`)
   * Document Highlight (`DocumentHighlightProvider = true`)
   * Document Symbol & Workspace Symbol
   * Semantic Tokens with full legend
   * Formatting & Range Formatting
   * Code Actions & Code Lens
2. **`initialized`**: Registers workspace file watchers for `**/hkd.toml` and `**/hkd.lock`.
3. **`shutdown` & `exit`**: Clean disposal of memory caches, in-flight cancellation tokens, and zero persistent leaks.

---

## 4. Incremental Document Engine & Invalidation

When a file is edited, the server receives incremental UTF-16 character range delta changes. The document manager:
1. Updates the in-memory line/column character buffer.
2. Computes the updated file version and invalidates cached AST and Symbol tables for that URI.
3. Queues a debounced diagnostic pass (200ms default) to avoid blocking keystrokes.
4. Uses the official Lexer and Parser, producing accurate diagnostics using HKD Error System 2.0 codes (`error[SYNxxx]`, `error[TYPExxx]`, `error[SEMxxx]`).

---

## 5. Authoritative Resolution Parity

The LSP uses the exact same `resolveModule` algorithm as the compiler and package manager:
* Relative paths: `./utils.hkd`, `../common/math.hkd`
* Local path dependencies: declared in `hkd.toml`
* Installed packages: `.hkd/deps/<name>/`
* Vendored packages: `vendor/<name>/`

There is zero duplicate or divergent path resolution logic between the compiler CLI and the Language Server.
