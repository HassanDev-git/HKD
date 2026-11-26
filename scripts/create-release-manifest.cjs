const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const releaseDir = path.resolve(process.env.HKD_RELEASE_DIR || "release-assets");
const sourceCommit = process.env.GITHUB_SHA;
if (!sourceCommit || !/^[a-f0-9]{40}$/i.test(sourceCommit)) throw new Error("GITHUB_SHA must be a full source commit SHA");
const expected = new Map([
  ["windows-x64", { platform: "Windows", architecture: "x64", os: "win32" }],
  ["windows-arm64", { platform: "Windows", architecture: "arm64", os: "win32" }],
  ["linux-x64", { platform: "Linux", architecture: "x64", os: "linux" }],
  ["linux-arm64", { platform: "Linux", architecture: "arm64", os: "linux" }],
  ["macos-x64", { platform: "macOS", architecture: "x64", os: "darwin" }],
  ["macos-arm64", { platform: "macOS", architecture: "arm64", os: "darwin" }],
]);
const files = fs.readdirSync(releaseDir).filter((name) => name.endsWith(".tar.gz")).sort();
if (files.length !== expected.size) throw new Error(`Expected exactly ${expected.size} platform archives, found ${files.length}`);
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const packages = files.map((name) => {
  const target = name.match(/^hkd-v[^-]+-(windows|linux|macos)-(x64|arm64)\.tar\.gz$/);
  if (!target) throw new Error(`Unexpected release asset name: ${name}`);
  const key = `${target[1]}-${target[2]}`;
  const metadata = expected.get(key);
  if (!metadata) throw new Error(`Unexpected target: ${key}`);
  if (name !== `hkd-v${pkg.version}-${key}.tar.gz`) throw new Error(`Archive name does not match package version and target: ${name}`);
  const archivePath = path.join(releaseDir, name);
  const embedded = JSON.parse(execFileSync("tar", ["-xOzf", archivePath, "./manifest.json"], { encoding: "utf8" }));
  if (embedded.version !== pkg.version) throw new Error(`${name} package version mismatch: ${embedded.version}`);
  if (embedded.sourceCommit !== sourceCommit) throw new Error(`${name} was built from ${embedded.sourceCommit}, expected ${sourceCommit}`);
  if (embedded.architecture !== metadata.architecture || embedded.os !== metadata.os) {
    throw new Error(`${name} target mismatch: ${embedded.os}/${embedded.architecture}`);
  }
  if (!embedded.zigVersion || !embedded.buildRunner) throw new Error(`${name} lacks Zig or runner provenance`);
  return {
    file: name,
    version: pkg.version,
    sourceCommit,
    platform: metadata.platform,
    architecture: metadata.architecture,
    target: key,
    runner: embedded.buildRunner,
    nodeVersion: embedded.nodeVersion,
    zigVersion: embedded.zigVersion,
    buildStatus: "PASS",
    verificationStatus: "PASS (native runner package smoke checks)",
    sizeBytes: fs.statSync(archivePath).size,
    sha256: sha256(archivePath),
  };
});
if (new Set(packages.map((item) => item.target)).size !== expected.size) throw new Error("Duplicate or missing platform target");
const manifest = {
  schemaVersion: 1,
  version: pkg.version,
  sourceCommit,
  tagName: process.env.GITHUB_REF?.startsWith("refs/tags/") ? process.env.GITHUB_REF.slice("refs/tags/".length) : null,
  status: process.env.GITHUB_REF?.startsWith("refs/tags/") ? "verified-release" : "verified-candidate",
  verificationScope: "Native host runner build and package smoke checks; see limitations for test-suite scope.",
  packages,
};
fs.writeFileSync(path.join(releaseDir, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(releaseDir, "SHA256SUMS"), `${packages.map((item) => `${item.sha256}  ${item.file}`).join("\n")}\n`);
const downloads = packages.map((item) => `- [${item.platform} ${item.architecture}](https://github.com/${process.env.GITHUB_REPOSITORY}/releases/download/v${pkg.version}/${item.file})`).join("\n");
const workflowUrl = `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const notes = fs.readFileSync(path.join(root, "docs", `release-notes-${pkg.version}.md`), "utf8");
const windowsArchive = `hkd-v${pkg.version}-windows-x64.tar.gz`;
const linuxArchive = `hkd-v${pkg.version}-linux-x64.tar.gz`;
const firstProgram = 'fn main() {\n    println("Hello, HKD")\n}\n';
const tick = String.fromCharCode(96);
const fence = tick.repeat(3);
const releaseNotes = [
  notes.trim(),
  "## Downloads",
  downloads,
  `- [SHA256SUMS](https://github.com/${process.env.GITHUB_REPOSITORY}/releases/download/v${pkg.version}/SHA256SUMS)`,
  `- [Release manifest](https://github.com/${process.env.GITHUB_REPOSITORY}/releases/download/v${pkg.version}/release-manifest.json)`,
  "## Installation",
  "Choose the archive for your OS and architecture, download it, and extract it to a directory you control. Add that directory to PATH to run HKD from any terminal. The standalone executable bundles Node.js.",
  "### Windows",
  `Extract ${windowsArchive} with PowerShell (Windows includes tar):`,
  `${fence}powershell\nNew-Item -ItemType Directory -Force "$HOME\\tools\\hkd" | Out-Null\ntar -xzf .\\${windowsArchive} -C "$HOME\\tools\\hkd"\n$env:Path += ";$HOME\\tools\\hkd"\n.\\hkd.exe --version\n${fence}`,
  "Add the extracted directory to your User PATH in Windows Settings for future terminals.",
  "### Linux and macOS",
  `Download the matching architecture archive (for example, ${linuxArchive}), then extract and run:`,
  `${fence}sh\ntar -xzf ${linuxArchive}\nchmod +x ./hkd\n./hkd --version\nexport PATH="$PATH:/path/to/extracted/hkd-directory"\n${fence}`,
  "Add the PATH export to your shell profile to keep it across terminal sessions.",
  "### Run a first program",
  `Save as ${tick}hello.hkd${tick}:\n\n${fence}hkd\n${firstProgram}${fence}`,
  `Run ${tick}hkd run hello.hkd${tick} and check the installed version with ${tick}hkd --version${tick}.`,
  "## Integrity and provenance",
  `Compare the archive SHA-256 with its line in [SHA256SUMS](https://github.com/${process.env.GITHUB_REPOSITORY}/releases/download/v${pkg.version}/SHA256SUMS). Inspect [release-manifest.json](https://github.com/${process.env.GITHUB_REPOSITORY}/releases/download/v${pkg.version}/release-manifest.json) for platform, architecture, runner, Node, Zig, source commit, size, and verification status.`,
  `Source commit: ${tick}${sourceCommit}${tick}`,
  `Native build and package verification workflow: [run ${process.env.GITHUB_RUN_ID}](${workflowUrl}).`,
].join("\n\n") + "\n";
fs.writeFileSync(path.join(releaseDir, "RELEASE_NOTES.md"), releaseNotes);
console.log(`Created manifest and checksums for ${packages.length} verified candidate packages at ${releaseDir}`);
