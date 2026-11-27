# HKD for Visual Studio Code

The HKD extension adds `.hkd` syntax highlighting, language-server diagnostics and completion, and DAP debugging.

## Requirements

- Visual Studio Code 1.75 or newer.
- An HKD CLI build containing the LSP/DAP startup fix, available as `hkd` on `PATH` or configured with `hkd.lsp.path`. The published v1.1.1 executable has a startup defect for these commands; no later release has been published.

The extension starts the installed HKD CLI with `hkd lsp` and `hkd dap`. It does not contain a private copy of the compiler. The standalone HKD release currently distributes the CLI separately from this VSIX.

## Install a local VSIX

From the repository:

```sh
cd vscode-extension
npm ci
npm run typecheck
npm run package
code --install-extension hkd-1.1.1.vsix
```

Alternatively, install a verified VSIX file from a trusted HKD release or build artifact. A Marketplace listing is not implied by this repository package.

## Configure the executable

Set `hkd.lsp.path` to the full path of `hkd.exe` on Windows or `hkd` on Linux/macOS when the executable is not available on `PATH`.

Open a `.hkd` file to activate language support. Use the **HKD: Debug Active File** command or the provided `hkd-debug` launch configuration to start a debug session.
