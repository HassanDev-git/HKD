const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const crypto = require("crypto");

const IS_WIN = process.platform === "win32";

// Directories
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const seaConfigPath = path.join(distDir, "sea-config.json");
const seaBlobPath = path.join(distDir, "sea-prep.blob");
const bundlePath = path.join(distDir, "bundle.js");

// Release output directory
const platformName = IS_WIN ? "windows-x64" : (process.platform === "darwin" ? "macos-x64" : "linux-x64");
const releaseDir = path.join(distDir, "releases", platformName);
const exeName = IS_WIN ? "hkd.exe" : "hkd";
const releaseExePath = path.join(releaseDir, exeName);

function run(file, args) {
  const res = spawnSync(file, args, { cwd: rootDir, stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error(`Command failed with status ${res.status}: ${file} ${args.join(" ")}`);
  }
}

function clean() {
  console.log("Cleaning old build artifacts...");
  if (fs.existsSync(releaseDir)) {
    fs.rmSync(releaseDir, { recursive: true, force: true });
  }
  if (fs.existsSync(seaBlobPath)) fs.unlinkSync(seaBlobPath);
  if (fs.existsSync(seaConfigPath)) fs.unlinkSync(seaConfigPath);
  if (fs.existsSync(bundlePath)) fs.unlinkSync(bundlePath);
}

function build() {
  console.log("Compiling TypeScript source...");
  const tscPath = path.join(rootDir, "node_modules", "typescript", "bin", "tsc");
  run(process.execPath, [tscPath]);
}

function bundle() {
  console.log("Bundling JS entry point...");
  const esbuildPath = path.join(rootDir, "node_modules", "esbuild", "bin", "esbuild");
  run(process.execPath, [esbuildPath, "dist/cli/main.js", "--bundle", "--platform=node", "--outfile=dist/bundle.js"]);
}

function generateBlob() {
  console.log("Creating SEA blob configuration...");
  const seaConfig = {
    main: "dist/bundle.js",
    output: "dist/sea-prep.blob"
  };
  fs.writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2), "utf-8");

  console.log("Building blob...");
  run(process.execPath, ["--experimental-sea-config", "dist/sea-config.json"]);
}

function packageBinary() {
  console.log(`Packaging standalone executable for ${platformName}...`);
  fs.mkdirSync(releaseDir, { recursive: true });

  const nodeExePath = process.execPath;
  console.log(`Copying Node executable from: ${nodeExePath}`);
  fs.copyFileSync(nodeExePath, releaseExePath);

  console.log("Detecting sentinel fuse dynamically from binary...");
  const fileBuffer = fs.readFileSync(releaseExePath);
  const fusePrefix = Buffer.from("NODE_SEA_FUSE");
  const index = fileBuffer.indexOf(fusePrefix);
  if (index === -1) {
    throw new Error("Could not find NODE_SEA_FUSE prefix in Node binary!");
  }

  let sentinel = "";
  for (let i = 0; i < 128; i++) {
    const char = String.fromCharCode(fileBuffer[index + i]);
    if (/^[a-zA-Z0-9_]$/.test(char)) {
      sentinel += char;
    } else {
      break;
    }
  }
  console.log(`Detected sentinel fuse: ${sentinel}`);

  console.log("Injecting blob into binary...");
  
  const postjectCli = path.join(rootDir, "node_modules", "postject", "dist", "cli.js");
  const postjectArgs = [
    postjectCli,
    releaseExePath,
    "NODE_SEA_BLOB",
    seaBlobPath,
    "--sentinel-fuse",
    sentinel
  ];
  if (process.platform === "darwin") {
    postjectArgs.push("--macho-segment-name", "NODE_SEA");
  }
  
  run(process.execPath, ["--max-old-space-size=4096", ...postjectArgs]);

  if (process.platform === "darwin") {
    console.log("Code-signing macOS binary...");
    run("codesign", ["--sign", "-", "--force", "--preserve-metadata=entitlements,requirements,flags,runtime", releaseExePath]);
  }

  console.log(`Standalone executable created at: ${releaseExePath}`);
}

function generateChecksum() {
  console.log("Generating SHA256 checksum...");
  const fileBuffer = fs.readFileSync(releaseExePath);
  const hashSum = crypto.createHash("sha256");
  hashSum.update(fileBuffer);
  const hex = hashSum.digest("hex");

  const checksumFile = path.join(distDir, "releases", "SHA256SUMS");
  const relativeExePath = path.relative(path.join(distDir, "releases"), releaseExePath).replace(/\\/g, "/");
  let existingLines = [];
  if (fs.existsSync(checksumFile)) {
    existingLines = fs.readFileSync(checksumFile, "utf-8")
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.endsWith(relativeExePath));
  }
  existingLines.push(`${hex}  ${relativeExePath}`);
  fs.writeFileSync(checksumFile, existingLines.join("\n") + "\n", "utf-8");
  console.log(`Checksum recorded: ${hex}  ${relativeExePath}`);
}

function runSmokeTests() {
  console.log("\n=== Running Standalone Binary Smoke Tests ===");
  
  const runTest = (name, args, expectedCode, expectedOutputMatch) => {
    console.log(`Smoke test: ${name} [hkd ${args.join(" ")}]`);
    const res = spawnSync(releaseExePath, args, { encoding: "utf-8", stdio: "pipe" });
    const actualCode = res.status ?? (res.error ? 1 : 0);
    const combinedOutput = (res.stdout ?? "") + (res.stderr ?? "");

    if (actualCode !== expectedCode) {
      console.error(`  FAIL: Expected exit code ${expectedCode}, got ${actualCode}`);
      console.error(`  Combined output:\n${combinedOutput}`);
      process.exit(1);
    }
    
    if (expectedOutputMatch && !combinedOutput.includes(expectedOutputMatch)) {
      console.error(`  FAIL: Output does not match expected pattern: "${expectedOutputMatch}"`);
      console.error(`  Actual output:\n${combinedOutput}`);
      process.exit(1);
    }
    console.log("  ✓ PASS");
  };

  runTest("Version Command", ["version"], 0, "HKD 1.1.0");
  runTest("Help Command", ["help"], 0, "USAGE:");
  runTest("Valid program execution", ["run", "examples/structs/structs.hkd"], 0, "=== HKD Structs ===");
  runTest("Missing file execution", ["run", "non_existent_file.hkd"], 1, "File not found");
  runTest("Invalid command", ["invalid-command-xyz"], 2, "Unknown command");

  console.log("=== All Standalone Smoke Tests Passed! ===\n");
}

function main() {
  try {
    clean();
    build();
    bundle();
    generateBlob();
    packageBinary();
    generateChecksum();
    runSmokeTests();
    console.log("Packaging process completed successfully!");
  } catch (error) {
    console.error("Packaging failed:", error);
    process.exit(1);
  }
}

main();
