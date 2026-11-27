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

function runHkd(name: string, args: string[], cwd?: string): Thenable<vscode.TaskExecution> {
  const folder = vscode.workspace.workspaceFolders?.find((workspace) => {
    if (!cwd) return false;
    const relative = path.relative(workspace.uri.fsPath, cwd);
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  }) ?? vscode.workspace.workspaceFolders?.[0];
  const scope: vscode.WorkspaceFolder | vscode.TaskScope = folder ?? vscode.TaskScope.Global;
  const task = new vscode.Task(
    { type: "hkd", command: name }, scope, name, "HKD",
    new vscode.ProcessExecution(configuredHkdCommand(), args, { cwd: cwd ?? folder?.uri.fsPath }),
  );
  task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated };
  return vscode.tasks.executeTask(task);
}

export async function activate(context: vscode.ExtensionContext) {
  const hkdCommand = configuredHkdCommand();
  const enabled = vscode.workspace.getConfiguration("hkd").get<boolean>("lsp.enable", true);
  const output = vscode.window.createOutputChannel("HKD Language Server");
  context.subscriptions.push(output);
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

  if (enabled) client = new LanguageClient(
    "hkdLanguageServer",
    "HKD Language Server 2.0",
    serverOptions,
    clientOptions
  );

  if (client) {
    try {
      await client.start();
      output.appendLine(`Started ${hkdCommand} lsp`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(`Failed to start ${hkdCommand} lsp: ${message}`);
      output.show(true);
      void vscode.window.showErrorMessage(`HKD language server could not start. Check the HKD CLI path and the HKD Language Server output. ${message}`);
    }
  }

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
        try {
          await client.start();
          vscode.window.showInformationMessage("HKD Language Server restarted.");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          output.appendLine(`Failed to restart language server: ${message}`);
          output.show(true);
          vscode.window.showErrorMessage(`HKD language server could not restart: ${message}`);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hkd.runFile", async () => {
      const activeDoc = vscode.window.activeTextEditor?.document;
      if (!activeDoc || activeDoc.languageId !== "hkd") {
        vscode.window.showWarningMessage("No active HKD file to run.");
        return;
      }
      if (!await activeDoc.save()) return;
      void runHkd("Run HKD file", ["run", activeDoc.fileName], path.dirname(activeDoc.fileName));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hkd.debugFile", async () => {
      const activeDoc = vscode.window.activeTextEditor?.document;
      if (!activeDoc || activeDoc.languageId !== "hkd") {
        vscode.window.showWarningMessage("No active HKD file to debug.");
        return;
      }
      if (!await activeDoc.save()) return;
      vscode.debug.startDebugging(undefined, {
        type: "hkd-debug",
        name: `Debug ${path.basename(activeDoc.fileName)}`,
        request: "launch",
        program: activeDoc.fileName,
      });
    })
  );

  context.subscriptions.push(
    ...["hkd.doctor", "hkd.showEnvironment"].map((command) => vscode.commands.registerCommand(command, () => {
      void runHkd("Show HKD Environment", ["doctor"]);
    }))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hkd.installDeps", () => {
      void runHkd("Install HKD project dependencies", ["install"]);
    })
  );

  for (const [command, title, cliArgs] of [
    ["hkd.buildProject", "Build HKD project", ["build"]],
    ["hkd.checkFile", "Check HKD file", ["check"]],
  ] as const) {
    context.subscriptions.push(vscode.commands.registerCommand(command, async () => {
      const document = vscode.window.activeTextEditor?.document;
      if (command === "hkd.checkFile" && (!document || document.languageId !== "hkd")) {
        void vscode.window.showWarningMessage("Open an HKD file before running Check File.");
        return;
      }
      if (command === "hkd.buildProject" && !await vscode.workspace.saveAll()) return;
      if (command === "hkd.checkFile" && document && !await document.save()) return;
      const args = document && command === "hkd.checkFile" ? [...cliArgs, document.fileName] : [...cliArgs];
      void runHkd(title, args, document ? path.dirname(document.fileName) : undefined);
    }));
  }

  context.subscriptions.push(vscode.commands.registerCommand("hkd.formatFile", async () => {
    const document = vscode.window.activeTextEditor?.document;
    if (!document || document.languageId !== "hkd") {
      void vscode.window.showWarningMessage("Open an HKD file before running Format File.");
      return;
    }
    if (!await document.save()) return;
    void runHkd("Format HKD file", ["fmt", "--write", document.fileName], path.dirname(document.fileName));
  }));

  // 4. Status Bar Indicator
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const extensionVersion = context.extension.packageJSON.version as string;
  statusBarItem.text = `$(gear) HKD ${extensionVersion}`;
  statusBarItem.tooltip = "HKD Tooling Suite Active";
  statusBarItem.command = "hkd.showEnvironment";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
