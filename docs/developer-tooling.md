# HKD Developer Tooling & Editor Foundation

This document defines the architecture, specifications, and roadmap for HKD developer tooling, editor integrations, language servers, and file ecosystem conventions.

---

## 1. File Extension & Format Identification

The HKD language ecosystem standardizes on the following canonical file extensions and formats:

| Extension / File | MIME / Identifier | Role & Specification |
|---|---|---|
| `.hkd` | `text/x-hkd` | **HKD Source Code**: UTF-8 text containing HKD programs, modules, functions, structs, and tests. |
| `.hkdb` | `application/x-hkd-bytecode` | **HKD Compiled Bytecode**: Binary serialised representation of compiled chunks (`0x48 0x4B 0x44 0x42` / `HKDB` magic header) with bytecode instruction stream and constant pool. |
| `.hkdpack` | `application/x-hkd-package` | **HKD Package Archive**: Deterministic tar/binary archive with `HKDPACK` header, containing manifest and bundled package sources. |
| `hkd.toml` | `text/x-toml` | **Project Manifest**: TOML configuration specifying package name, version, edition (`2026` or `2027`), entrypoint, author, license, and dependencies. |
| `hkd.lock` | `application/json` | **Reproducible Lockfile**: Content-addressed resolution tree of exact package versions, checksums, and dependency edges. |

---

## 2. Editor Integration Architecture

HKD provides first-class developer tooling through open protocols:

```text
┌────────────────────────────────────────┐
│  Editor / IDE (VS Code, Zed, Neovim)   │
└────────────┬───────────────────────────┘
             │ JSON-RPC (stdio)
    ┌────────┴────────┐
    ▼                 ▼
┌───────────────┐ ┌───────────────┐
│  hkd lsp      │ │  hkd dap      │
│  (LSP Server) │ │  (Debug)      │
└───────┬───────┘ └───────┬───────┘
        │                 │
        ▼                 ▼
┌─────────────────────────────────┐
│     HKD Core Toolchain Engine   │
│  Parser · Semantic · Formatter  │
└─────────────────────────────────┘
```

---

## 3. Language Server Protocol (LSP 2.0)

Command: `hkd lsp`

The HKD Language Server implements the standard Language Server Protocol (LSP) over `stdio` to provide real-time IDE features:

### Supported Capabilities
- **Diagnostics (`textDocument/publishDiagnostics`)**: Real-time syntax and type error squiggles with source line, column span, severity, and error codes (`E101`–`E305`).
- **Hover (`textDocument/hover`)**: Type signatures, doc comments, and function declarations on hover.
- **Go to Definition (`textDocument/definition`)**: Jump to symbol declarations across local files and imported modules.
- **Document Formatting (`textDocument/formatting`)**: Canonical code formatting integrated with `hkd fmt`.
- **Document Symbols (`textDocument/documentSymbol`)**: Outline views of functions, structs, variables, and test blocks.
- **Completion (`textDocument/completion`)**: Context-aware keywords, types, and identifier completions.

### Editor Configuration (VS Code / Zed / Neovim)

```json
{
  "languages": {
    "hkd": {
      "command": "hkd",
      "args": ["lsp"],
      "filetypes": [".hkd"]
    }
  }
}
```

---

## 4. Debug Adapter Protocol (DAP)

Command: `hkd dap`

The HKD Debug Adapter implements the standard Debug Adapter Protocol over `stdio`:
- **Breakpoints**: Source line and conditional breakpoints.
- **Stack Trace Inspection**: Activation frames across both Register VM and Stack VM.
- **Scope & Variable Inspection**: Local registers, environment bindings, and struct fields.
- **Step Navigation**: Step In, Step Over, Step Out, and Pause/Continue controls.

---

## 5. Syntax Grammar & Tokenization Roadmap

HKD provides syntax highlighting through two canonical mechanisms:

### TextMate Grammar (`syntaxes/hkd.tmLanguage.json`)
Targeted for Visual Studio Code, TextMate, Sublime Text, and GitHub Linguist:
- **Keywords**: `let`, `fn`, `struct`, `test`, `assert`, `return`, `if`, `else`, `while`, `for`, `in`, `import`, `export`, `match`.
- **Built-in Types**: `Int`, `Float`, `String`, `Bool`, `Array`, `Map`, `Option`, `Result`, `Void`.
- **Literals**: Numbers (`123`, `3.14`), Strings (`"hello"`, `"escaped\n"`), Booleans (`true`, `false`), Null/None.
- **Comments**: Single-line (`// ...`) and doc comments (`/// ...`).

### Tree-Sitter Grammar (`tree-sitter-hkd`)
Targeted for modern high-performance editors (Neovim, Zed, Helix, GitHub AST views):
- Incremental parsing for zero-latency highlight updates.
- Highlights query: `queries/highlights.scm`.
- Locals & scope query: `queries/locals.scm`.
- Indents query: `queries/indents.scm`.

---

## 6. Developer Workflows

| Task | Command | Description |
|---|---|---|
| Project Creation | `hkd init <name>` | Scaffold complete project |
| Real-time Checking | `hkd check` | Fast type checking without emit |
| Auto-formatting | `hkd fmt -w` | Canonical code formatting |
| Linting & Quick-fix | `hkd lint --fix` | Style and semantic correction |
| Interactive REPL | `hkd repl` | Exploratory development |
| Diagnostic Health | `hkd doctor` | Environment verification |
