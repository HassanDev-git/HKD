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

export function activate(context: vscode.ExtensionContext) {
  // 1. Language Server (LSP 2.0)
  const serverModule = context.asAbsolutePath(
    path.join("..", "dist", "lsp", "server.js")
  );

  const serverOptions: ServerOptions = {
    run: { command: "node", args: [serverModule] },
    debug: { command: "node", args: [serverModule] },
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
  const dapModule = context.asAbsolutePath(
    path.join("..", "dist", "debug", "server.js")
  );

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory("hkd-debug", {
      createDebugAdapterDescriptor(): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        return new vscode.DebugAdapterExecutable("node", [dapModule]);
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
      terminal.sendText(`node dist/cli/main.js run "${activeDoc.fileName}"`);
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
      terminal.sendText("node dist/cli/main.js doctor");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hkd.installDeps", () => {
      const terminal = vscode.window.createTerminal("HKD Package Manager");
      terminal.show();
      terminal.sendText("node dist/cli/main.js install");
    })
  );

  // 4. Status Bar Indicator
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "$(gear) HKD 0.1.0";
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
