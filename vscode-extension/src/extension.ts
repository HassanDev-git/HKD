/**
 * HKD VS Code Extension Main Entrypoint
 *
 * Coordinates LSP LanguageClient, DAP DebugAdapterDescriptorFactory,
 * editor commands, status bar indicator, and workspace integration.
 */

import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;
let statusBarItem: vscode.StatusBarItem;

function configuredHkdCommand(): string {
  return vscode.workspace.getConfiguration("hkd").get<string>("lsp.path", "") || "hkd";
}

function quoteTerminalArgument(value: string): string {
  if (process.platform === "win32") return `"${value.replaceAll('"', '""')}"`;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function activate(context: vscode.ExtensionContext) {
  const hkdCommand = configuredHkdCommand();
  // 1. Language Server (LSP 2.0)
  const serverOptions: ServerOptions = {
    run: { command: hkdCommand, args: ["lsp"] },
    debug: { command: hkdCommand, args: ["lsp"] },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "hkd" }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/{hkd.toml,hkd.lock}"),
    },
  };

  client = new LanguageClient(
    "hkdLanguageServer",
    "HKD Language Server 2.0",
    serverOptions,
    clientOptions
  );

  client.start();

  // 2. Debug Adapter (DAP)
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory("hkd-debug", {
      createDebugAdapterDescriptor(): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        return new vscode.DebugAdapterExecutable(hkdCommand, ["dap"]);
      },
    })
  );

  // 3. Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("hkd.restartServer", async () => {
      if (client) {
        await client.stop();
        client.start();
        vscode.window.showInformationMessage("HKD Language Server restarted.");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hkd.runFile", () => {
      const activeDoc = vscode.window.activeTextEditor?.document;
      if (!activeDoc || activeDoc.languageId !== "hkd") {
        vscode.window.showWarningMessage("No active HKD file to run.");
        return;
      }
      const terminal = vscode.window.createTerminal("HKD Run");
      terminal.show();
      terminal.sendText(`${quoteTerminalArgument(hkdCommand)} run ${quoteTerminalArgument(activeDoc.fileName)}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hkd.debugFile", () => {
      const activeDoc = vscode.window.activeTextEditor?.document;
      if (!activeDoc || activeDoc.languageId !== "hkd") {
        vscode.window.showWarningMessage("No active HKD file to debug.");
        return;
      }
      vscode.debug.startDebugging(undefined, {
        type: "hkd-debug",
        name: `Debug ${path.basename(activeDoc.fileName)}`,
        request: "launch",
        program: activeDoc.fileName,
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hkd.doctor", () => {
      const terminal = vscode.window.createTerminal("HKD Doctor");
      terminal.show();
      terminal.sendText(`${quoteTerminalArgument(hkdCommand)} doctor`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hkd.installDeps", () => {
      const terminal = vscode.window.createTerminal("HKD Package Manager");
      terminal.show();
      terminal.sendText(`${quoteTerminalArgument(hkdCommand)} install`);
    })
  );

  // 4. Status Bar Indicator
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "$(gear) HKD 1.1.1";
  statusBarItem.tooltip = "HKD Tooling Suite Active";
  statusBarItem.command = "hkd.doctor";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
