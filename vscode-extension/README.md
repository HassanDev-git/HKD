# HKD for Visual Studio Code

The HKD extension adds `.hkd` syntax highlighting, language-server diagnostics and completion, and DAP debugging.

## Requirements

- Visual Studio Code 1.75 or newer.
- HKD CLI v1.1.2 or later, available as `hkd` on `PATH` or configured with `hkd.lsp.path`. The published v1.1.1 executable has a startup defect for LSP and DAP.

The extension starts the installed HKD CLI with `hkd lsp` and `hkd dap`. It does not contain a private copy of the compiler. The standalone HKD release currently distributes the CLI separately from this VSIX.

## Install a local VSIX

From the repository:

```sh
cd vscode-extension
npm ci
npm run typecheck
npm run package
code --install-extension hkd-1.1.2.vsix
```

Alternatively, install a verified VSIX file from a trusted HKD release or build artifact. A Marketplace listing is not implied by this repository package.

## Configure the executable

Set `hkd.lsp.path` to the full path of `hkd.exe` on Windows or `hkd` on Linux/macOS when the executable is not available on `PATH`.

Open a `.hkd` file to activate language support. The extension provides LSP diagnostics, completion, hover, definition, references, symbols, rename, semantic tokens and formatting where supported by the server. Use **HKD: Debug Active File** or the provided `hkd-debug` launch configuration for breakpoints, stepping and variable inspection supported by the DAP server. **HKD: Format File** writes formatted output to the source file. Other commands run through VS Code process tasks so paths are passed as arguments without shell interpolation.

To show the official HKD document icon for `.hkd` files, open **Preferences: File Icon Theme** and select **HKD File Icons**. VS Code lets users choose their own file icon theme, so installing this extension does not change the active theme automatically.

Available commands include Run File, Build Project, Check File, Format File, Restart Language Server, Install Project Dependencies, and Show HKD Environment. If the configured CLI cannot start, inspect the **HKD Language Server** output channel and verify `hkd.lsp.path`.
