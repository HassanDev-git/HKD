const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const extensionDir = path.resolve(__dirname, "..", "vscode-extension");
const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, "package.json"), "utf8"));
const entry = path.resolve(extensionDir, manifest.main);
assert.equal(manifest.version, require("../package.json").version);
assert.ok(fs.existsSync(entry), `missing compiled extension entry point ${entry}`);
const bundle = fs.readFileSync(entry, "utf8");
assert.match(bundle, /hkdLanguageServer/);
assert.match(bundle, /hkd-debug/);
assert.match(bundle, /\["lsp"\]/);
assert.match(bundle, /\["dap"\]/);
assert.doesNotMatch(bundle, /\.\.\/dist\/(?:lsp|debug)\/server\.js/);
assert.equal(manifest.contributes.configuration.properties["hkd.lsp.path"].default, "");
const commands = new Set(manifest.contributes.commands.map((command) => command.command));
for (const command of ["hkd.runFile", "hkd.debugFile", "hkd.buildProject", "hkd.checkFile", "hkd.formatFile", "hkd.installDeps", "hkd.doctor", "hkd.restartServer", "hkd.showEnvironment"]) {
  assert.ok(commands.has(command), `missing contributed command ${command}`);
}
assert.ok(manifest.contributes.snippets.some((snippet) => snippet.language === "hkd"));

const vsix = path.join(extensionDir, `${manifest.name}-${manifest.version}.vsix`);
assert.ok(fs.existsSync(vsix), `missing packaged VSIX ${vsix}; run npm run package first`);
const listing = spawnSync("tar", ["-tf", vsix], { encoding: "utf8", timeout: 30000 });
assert.equal(listing.status, 0, listing.stderr);
for (const file of [
  "extension/package.json",
  "extension/dist/extension.js",
  "extension/language-configuration.json",
  "extension/syntaxes/hkd.tmLanguage.json",
  "extension/snippets/hkd.json",
]) assert.ok(listing.stdout.includes(file), `VSIX missing ${file}`);
assert.doesNotMatch(listing.stdout, /extension\/node_modules\//);
console.log("VS Code extension smoke passed: compiled entry, CLI-based LSP/DAP launch, manifest, and VSIX contents.");
