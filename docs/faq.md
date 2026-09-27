# HKD Frequently Asked Questions (FAQ)

## General

### What is HKD?
HKD is a modern, statically typed, memory-safe, embeddable programming language engineered for high performance, deterministic concurrency, and developer joy. It combines clean ergonomics with a dual-runtime model (an ultra-fast native Zig bytecode engine and an extensible reference VM).

### What is the current version?
HKD 1.1.0 (Public Developer Preview).

---

## Language & Editions

### What are Editions and how do they work?
HKD employs an edition-based evolution system inspired by Rust to guarantee backwards compatibility:
- **Edition 2026 (Default / Stable)**: The frozen, production-grade foundation of HKD 1.0. All syntax, semantics, and standard library behaviors are guaranteed stable.
- **Edition 2027 (Opt-in Preview)**: Enables advanced features including generic structs/functions, pattern matching with destructuring, async/await (RFC-004), and enhanced type inference.

To opt into Edition 2027 in your project, declare it in `hkd.toml`:
```toml
[package]
name = "my-service"
version = "0.1.0"
edition = "2027"
```

### Can Edition 2026 projects use dependencies written in Edition 2027?
Yes. HKD compiles all source modules according to their declared edition and links them deterministically at bytecode boundaries.

---

## Installation & Setup

### How do I install HKD?
- **Windows**: Download `hkd-v1.1.0-windows-x64.zip` from GitHub Releases, extract to a directory (e.g. `C:\tools\hkd`), and add the directory to your system `PATH`.
- **Node.js / npm (Preview)**: Run `npm install -g hkd` or clone the repository and run `npm run build && npm link`.
- **Self-Diagnostic**: Verify your installation at any time by running:
  ```bash
  hkd doctor
  ```

---

## Development & Tooling

### How do I create a new project?
```bash
hkd init my-app
cd my-app
hkd run src/main.hkd
```

### How does package management work?
HKD features a zero-configuration package manager:
- Manifest file: `hkd.toml`
- Lockfile: `hkd.lock` (Lockfile V2 TOML format with cryptographic SHA-256 hashes)
- Content-addressed package cache: stored in `~/.hkd/cache/packages/`
- Add a dependency: `hkd add <pkg_name> --version <semver>`
- Audit dependencies: `hkd audit`
- Verify integrity: `hkd verify`

### What is the difference between the Native Runtime and the Reference VM?
- **Native Runtime (`hkd-runtime.exe`)**: Written in Zig, high-throughput bytecode interpreter with low memory footprint and sub-millisecond execution times. Default for `hkd run <file>`.
- **Reference VM**: Written in TypeScript, provides complete reflection, debugging inspection, DAP integration, and browser/WASM embedding. Accessible via `hkd run --reference <file>`.

### Does HKD have an LSP server and VS Code support?
Yes. HKD includes a built-in Language Server Protocol 2.0 implementation (`hkd lsp`) and Debug Adapter Protocol implementation (`hkd dap`). The official VS Code extension is located in `vscode-extension/` and supports syntax highlighting, diagnostics, hover docs, and breakpoint debugging.

---

## Contributing & Support

### Where can I report bugs or suggest RFCs?
Please open an issue on the official GitHub repository at `https://github.com/HassanDev-git/HKD/issues`.
