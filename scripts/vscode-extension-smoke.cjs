const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const extensionDir = path.resolve(__dirname, "..", "vscode-extension");
const yauzl = require(path.join(extensionDir, "node_modules", "yauzl"));
const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, "package.json"), "utf8"));
const entry = path.resolve(extensionDir, manifest.main);
assert.equal(manifest.version, require("../package.json").version);
assert.equal(manifest.icon, "./icons/hkd-logo.png", "extension branding must use the official logo");
assert.ok(fs.existsSync(path.resolve(extensionDir, manifest.icon)), "missing official HKD extension logo");
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
const iconThemeContribution = manifest.contributes.iconThemes.find((theme) => theme.id === "hkd-file-icons");
assert.ok(iconThemeContribution, "missing HKD file icon theme contribution");
const iconThemePath = path.resolve(extensionDir, iconThemeContribution.path);
const iconTheme = JSON.parse(fs.readFileSync(iconThemePath, "utf8"));
assert.equal(iconTheme.fileExtensions.hkd, "_hkd", "the icon theme must associate .hkd files");
const iconPath = path.resolve(path.dirname(iconThemePath), iconTheme.iconDefinitions._hkd.iconPath);
assert.ok(fs.existsSync(iconPath), `missing HKD file icon ${iconPath}`);

const vsix = path.join(extensionDir, `${manifest.name}-${manifest.version}.vsix`);
assert.ok(fs.existsSync(vsix), `missing packaged VSIX ${vsix}; run npm run package first`);
function listZipEntries(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, archive) => {
      if (error) return reject(error);
      const names = [];
      archive.on("error", reject);
      archive.on("entry", (entry) => {
        names.push(entry.fileName);
        archive.readEntry();
      });
      archive.on("end", () => resolve(names));
      archive.readEntry();
    });
  });
}

function readZipEntry(zipPath, targetName) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, archive) => {
      if (error) return reject(error);
      archive.on("error", reject);
      archive.on("entry", (entry) => {
        if (entry.fileName !== targetName) {
          archive.readEntry();
          return;
        }
        archive.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("error", reject);
          stream.on("end", () => {
            archive.close();
            resolve(Buffer.concat(chunks));
          });
        });
      });
      archive.on("end", () => reject(new Error(`VSIX missing ${targetName}`)));
      archive.readEntry();
    });
  });
}

listZipEntries(vsix).then(async (entries) => {
  for (const file of [
    "extension/package.json",
    "extension/dist/extension.js",
    "extension/language-configuration.json",
    "extension/syntaxes/hkd.tmLanguage.json",
    "extension/snippets/hkd.json",
    "extension/icons/hkd-file-icon-theme.json",
    "extension/icons/hkd-file-icon.png",
    "extension/icons/hkd-logo.png",
  ]) assert.ok(entries.includes(file), `VSIX missing ${file}`);
  assert.ok(!entries.some((entry) => entry.startsWith("extension/node_modules/")));
  const packagedManifest = JSON.parse((await readZipEntry(vsix, "extension/package.json")).toString("utf8"));
  assert.equal(packagedManifest.icon, "./icons/hkd-logo.png", "packaged extension must reference the official HKD logo");
  const packagedContribution = packagedManifest.contributes.iconThemes.find((theme) => theme.id === "hkd-file-icons");
  assert.ok(packagedContribution, "packaged extension manifest must contribute the HKD file icon theme");
  const packagedTheme = JSON.parse((await readZipEntry(vsix, "extension/icons/hkd-file-icon-theme.json")).toString("utf8"));
  assert.equal(packagedTheme.fileExtensions.hkd, "_hkd", "packaged icon theme must associate .hkd files");
  assert.equal(packagedContribution.path, "./icons/hkd-file-icon-theme.json");
  const packagedIcon = await readZipEntry(vsix, "extension/icons/hkd-file-icon.png");
  assert.equal(packagedIcon.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "packaged file icon must be a PNG");
  assert.equal(packagedIcon.readUInt8(25), 6, "packaged file icon PNG must preserve an RGBA transparency channel");
  const packagedLogo = await readZipEntry(vsix, "extension/icons/hkd-logo.png");
  assert.equal(packagedLogo.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "packaged logo must be a PNG");
  assert.equal(packagedLogo.readUInt8(25), 6, "packaged logo PNG must preserve an RGBA transparency channel");
  console.log("VS Code extension smoke passed: compiled entry, CLI-based LSP/DAP launch, manifest, .hkd icon association, and packaged icon assets.");
}).catch((error) => {
  console.error(`VSIX ZIP validation failed: ${error.message}`);
  process.exitCode = 1;
});
