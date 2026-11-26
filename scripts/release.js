/**
 * HKD Release Builder Script
 * 
 * Compiles the compiler, builds the native runtime in ReleaseFast mode,
 * and packages all release artifacts into `dist-release/`.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const rootDir = process.cwd();
const releaseDir = path.join(rootDir, "dist-release");

function log(msg) {
  console.log(`\x1b[36m[release-builder]\x1b[0m ${msg}`);
}

function runCmd(cmd, cwd = rootDir) {
  log(`Running: ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

// 1. Clean previous release artifacts
if (fs.existsSync(releaseDir)) {
  log("Cleaning previous dist-release directory...");
  fs.rmSync(releaseDir, { recursive: true, force: true });
}
fs.mkdirSync(releaseDir);

// 2. Build and smoke-test the current standalone TypeScript CLI before copying dist.
// This refreshes any existing SEA executable so stale binaries cannot leak into a bundle.
log("Building and smoke-testing the standalone TypeScript CLI...");
runCmd("npm run package");

// 3. Build native runtime in ReleaseFast mode
log("Building native Zig runtime...");
const nativeDir = path.join(rootDir, "native-runtime");
runCmd("npx zig build -Doptimize=ReleaseFast", nativeDir);

// 4. Create release structure
log("Packaging release artifacts...");
const binDir = path.join(releaseDir, "bin");
fs.mkdirSync(binDir);

// Copy CLI and libraries
fs.cpSync(path.join(rootDir, "dist"), path.join(releaseDir, "dist"), { recursive: true });
fs.copyFileSync(path.join(rootDir, "package.json"), path.join(releaseDir, "package.json"));

// Copy native executable
const binName = process.platform === "win32" ? "hkd-runtime.exe" : "hkd-runtime";
const nativeExe = path.join(nativeDir, "zig-out", "bin", binName);
if (fs.existsSync(nativeExe)) {
  fs.copyFileSync(nativeExe, path.join(binDir, binName));
  log(`✓ Packaged native executable: ${binName}`);
} else {
  console.error("Error: Native runtime executable not found!");
  process.exit(1);
}

log("\x1b[32m=== HKD Release Built Successfully ===\x1b[0m");
log(`Artifacts location: ${releaseDir}`);
log("Structure:");
log("  ├── package.json");
log("  ├── bin/");
log(`  │   └── ${binName}`);
log("  └── dist/ (JavaScript Compiler & CLI)");
