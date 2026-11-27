# HKD Frequently Asked Questions

## General

### What is HKD?

HKD is a statically typed programming language under active development. The repository includes a TypeScript compiler and reference VM, an optional Zig bytecode interpreter, a CLI, package tools, and LSP/DAP protocol servers. The reference VM and Zig runtime interpret bytecode; HKD does not currently provide JIT or native-code AOT compilation.

### What is the current version?

The current published release is [HKD 1.1.1](https://github.com/HassanDev-git/HKD/releases/tag/v1.1.1). Check [GitHub Releases](https://github.com/HassanDev-git/HKD/releases) for later stable versions.

## Language and runtime

### Are all language features production-ready?

No. Traits and language-level async/await remain experimental. JIT, native-code AOT, and WebAssembly/WASI compilation are unavailable. Read the [feature matrix](feature-matrix.md) and the relevant RFC status before relying on a feature.

### Is the Zig runtime required?

No. The standalone CLI runs programs with its bundled TypeScript compiler and reference VM. The Zig runtime is an optional bytecode interpreter that can be built separately.

## Installation and tooling

### How do I install HKD?

Download the archive for your operating system and architecture from [GitHub Releases](https://github.com/HassanDev-git/HKD/releases), verify its SHA-256 checksum, and extract it. The standalone executable bundles Node.js. For a source build, use Node.js 18 or newer, clone the repository, run `npm ci` and `npm run build`, then invoke `node dist/cli/main.js`.

### How do I create a project?

```sh
hkd init my-app
cd my-app
hkd run src/main.hkd
```

### How does package management work?

HKD reads project dependencies from `hkd.toml`, records resolved state in `hkd.lock`, and stores package data in a local cache. Use `hkd add <package> [version]`, `hkd install`, `hkd audit`, and `hkd cache list`. See the [package guide](package-guide.md) for details.

### Does HKD have LSP and DAP servers?

The current source branch includes LSP and DAP protocol servers. Start them with `hkd lsp` and `hkd dap`; both communicate over stdio, and source-built package smoke tests initialize each protocol. The published v1.1.1 executable has a startup defect for those commands; the fix has not yet been released.

### Is the VS Code extension on the Marketplace?

The extension source is in `vscode-extension/` and can be built into a VSIX with its documented package process. The repository does not currently publish a Marketplace listing or attach the VSIX to GitHub Releases. See the [VS Code guide](vscode.md).

## Support

Open issues and feature requests in the [HKD GitHub repository](https://github.com/HassanDev-git/HKD/issues). For vulnerabilities, follow [SECURITY.md](../SECURITY.md) and do not post secrets in a public issue.
