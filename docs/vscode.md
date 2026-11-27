# Visual Studio Code integration

HKD provides a separate VS Code extension package. It contributes `.hkd` syntax highlighting and starts the HKD CLI as its LSP and DAP processes. The standalone HKD CLI archives do not contain the extension VSIX.

## Requirements

- Visual Studio Code 1.75 or newer.
- An HKD CLI build containing the LSP/DAP startup fix, callable as `hkd`, or configured through `hkd.lsp.path`. The published v1.1.1 executable has a startup defect for these commands; the fix is present on the current source branch but is not yet in a published binary.

## Build and install a VSIX from source

```sh
cd vscode-extension
npm ci
npm run typecheck
npm test
npm run package
code --install-extension hkd-1.1.1.vsix
```

The VSIX is generated locally. The repository does not currently publish the extension to the Visual Studio Marketplace; do not treat the source manifest as proof of a Marketplace listing.

## Features

- Syntax grammar and `.hkd` language configuration.
- LSP language features provided by `hkd lsp`.
- DAP debugging provided by `hkd dap`.
- Commands for running the active file, debugging, restarting the server, running Doctor, and installing project dependencies.

The extension invokes the installed HKD executable. It does not require a development checkout or a separate `dist/lsp` or `dist/debug` directory.
