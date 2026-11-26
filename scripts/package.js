const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const zlib = require("zlib");
const { resolvePackagingTarget } = require("./package-platform.cjs");

const IS_WIN = process.platform === "win32";
const packagingTarget = resolvePackagingTarget(process.platform, process.arch);
const HOST_ARCH = packagingTarget.architecture;
const PLATFORM_LABEL = packagingTarget.platformLabel;

// Directories
const rootDir = path.resolve(__dirname, "..");
const distDir = process.env.HKD_DIST_DIR
  ? path.resolve(process.env.HKD_DIST_DIR)
  : path.join(rootDir, "dist");
const bundlePath = path.join(distDir, "bundle.js");

// Release output directory
const platformName = `${PLATFORM_LABEL}-${HOST_ARCH}`;
const releaseDir = path.join(distDir, "releases", platformName);
const exeName = packagingTarget.executableName;
let stagingDir = "";
let releaseExePath = "";
let stagedBundlePath = "";
let stagedCompiledDir = "";
let stagedSeaBlobPath = "";
let stagedPackageDir = "";
let stagedPackageArchive = "";
const finalExePath = path.join(releaseDir, exeName);

function run(file, args) {
  const res = spawnSync(file, args, { cwd: rootDir, stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error(`Command failed with status ${res.status}: ${file} ${args.join(" ")}`);
  }
}

function clean() {
  console.log("Preparing an isolated staging directory; existing release artifacts are preserved until smoke checks pass...");
  fs.mkdirSync(distDir, { recursive: true });
  stagingDir = fs.mkdtempSync(path.join(distDir, `.package-${platformName}-`));
  releaseExePath = path.join(stagingDir, exeName);
  stagedBundlePath = path.join(stagingDir, "bundle.js");
  stagedCompiledDir = path.join(stagingDir, "compiled");
  stagedSeaBlobPath = path.join(stagingDir, "sea-prep.blob");
  stagedPackageDir = path.join(stagingDir, "package");
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"));
  stagedPackageArchive = path.join(stagingDir, `hkd-v${pkg.version}-${platformName}.tar.gz`);
}

function build() {
  console.log("Compiling TypeScript source...");
  const tscPath = path.join(rootDir, "node_modules", "typescript", "bin", "tsc");
  run(process.execPath, [tscPath, "--outDir", stagedCompiledDir]);
}

function bundle() {
  console.log("Bundling JS entry point...");
  const esbuildPath = path.join(rootDir, "node_modules", "esbuild", "bin", "esbuild");
  run(process.execPath, [esbuildPath, path.join(stagedCompiledDir, "cli", "main.js"), "--bundle", "--platform=node", `--outfile=${stagedBundlePath}`]);
}

function generateBlob() {
  console.log("Creating SEA blob configuration...");
  const seaConfig = {
    main: stagedBundlePath,
    output: stagedSeaBlobPath
  };
  const stagedConfigPath = path.join(stagingDir, "sea-config.json");
  fs.writeFileSync(stagedConfigPath, JSON.stringify(seaConfig, null, 2), "utf-8");

  console.log("Building blob...");
  run(process.execPath, ["--experimental-sea-config", stagedConfigPath]);
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
    stagedSeaBlobPath,
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

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function createSingleFileZip(sourcePath, archivePath) {
  const data = fs.readFileSync(sourcePath);
  const compressed = zlib.deflateRawSync(data, { level: 9 });
  const name = Buffer.from(path.basename(sourcePath), "utf-8");
  const checksum = crc32(data);
  const stamp = dosDateTime(fs.statSync(sourcePath).mtime);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(stamp.time, 10);
  local.writeUInt16LE(stamp.date, 12);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  const localRecord = Buffer.concat([local, name, compressed]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(stamp.time, 12);
  central.writeUInt16LE(stamp.date, 14);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);
  const centralRecord = Buffer.concat([central, name]);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralRecord.length, 12);
  end.writeUInt32LE(localRecord.length, 16);
  end.writeUInt16LE(0, 20);
  fs.writeFileSync(archivePath, Buffer.concat([localRecord, centralRecord, end]));
}

function extractVerifiedSingleFileZip(archivePath, destinationDir) {
  const zip = fs.readFileSync(archivePath);
  if (zip.readUInt32LE(0) !== 0x04034b50 || zip.readUInt32LE(zip.length - 22) !== 0x06054b50) {
    throw new Error("ZIP local header or end record is invalid");
  }
  const entryCount = zip.readUInt16LE(zip.length - 22 + 10);
  const centralOffset = zip.readUInt32LE(zip.length - 22 + 16);
  if (entryCount !== 1 || zip.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error("ZIP must contain exactly one valid entry");
  const nameLength = zip.readUInt16LE(centralOffset + 28);
  const entryName = zip.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString("utf-8");
  const method = zip.readUInt16LE(8);
  const compressedSize = zip.readUInt32LE(18);
  const uncompressedSize = zip.readUInt32LE(22);
  const expectedCrc = zip.readUInt32LE(14);
  const dataOffset = 30 + zip.readUInt16LE(26) + zip.readUInt16LE(28);
  if (entryName !== "hkd.exe" || method !== 8) throw new Error(`Unexpected ZIP entry: ${entryName}`);
  const data = zlib.inflateRawSync(zip.subarray(dataOffset, dataOffset + compressedSize));
  if (data.length !== uncompressedSize || crc32(data) !== expectedCrc) throw new Error("ZIP payload size or CRC check failed");
  fs.mkdirSync(destinationDir, { recursive: true });
  const extractedPath = path.join(destinationDir, entryName);
  fs.writeFileSync(extractedPath, data);
  return [entryName];
}

function makeWindowsArchive() {
  const archiveName = `hkd-v1.1.0-windows-${HOST_ARCH}.zip`;
  const stagedArchive = path.join(stagingDir, archiveName);
  createSingleFileZip(releaseExePath, stagedArchive);
  return stagedArchive;
}

function makeTarPackage() {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"));
  fs.mkdirSync(stagedPackageDir, { recursive: true });
  const stagedPackageExecutable = path.join(stagedPackageDir, exeName);
  fs.copyFileSync(releaseExePath, stagedPackageExecutable);
  if (!IS_WIN) fs.chmodSync(stagedPackageExecutable, 0o755);

  const documentation = [
    ["README.md", "README.md"],
    ["LICENSE", "LICENSE"],
    ["docs/getting-started.md", "docs/getting-started.md"],
    ["docs/cli-reference.md", "docs/cli-reference.md"],
    ["docs/known-limitations.md", "docs/known-limitations.md"],
    ["docs/release-notes-1.1.0.md", "docs/release-notes-1.1.0.md"],
  ];
  for (const [source, destination] of documentation) {
    const sourcePath = path.join(rootDir, source);
    if (!fs.existsSync(sourcePath)) throw new Error(`Required package documentation is missing: ${source}`);
    const destinationPath = path.join(stagedPackageDir, destination);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
  }

  const installText = [
    `HKD ${pkg.version} standalone package for ${platformName}`,
    "",
    "This package includes the HKD command-line executable and user documentation.",
    "The executable bundles Node.js and the TypeScript reference VM; a separate Node.js installation is not required.",
    "",
    IS_WIN ? "Run: .\\hkd.exe --help" : "Run: chmod +x ./hkd && ./hkd --help",
    "",
    "The executable interprets HKD bytecode. JIT dispatch and native-code AOT are unavailable.",
    "See README.md and docs/ for usage and limitations.",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(stagedPackageDir, "INSTALL.txt"), installText, "utf-8");

  const payloadNames = [
    exeName,
    "README.md",
    "LICENSE",
    "INSTALL.txt",
    "docs/getting-started.md",
    "docs/cli-reference.md",
    "docs/known-limitations.md",
    "docs/release-notes-1.1.0.md",
  ];
  const files = payloadNames.map((file) => {
    const fullPath = path.join(stagedPackageDir, file);
    return { path: file.replace(/\\/g, "/"), sha256: sha256(fullPath), sizeBytes: fs.statSync(fullPath).size };
  });
  const packageManifest = {
    name: pkg.name,
    version: pkg.version,
    target: platformName,
    architecture: process.arch,
    os: process.platform,
    sourceCommit: process.env.GITHUB_SHA || null,
    nodeVersion: process.version,
    buildTimestamp: new Date().toISOString(),
    files,
  };
  fs.writeFileSync(path.join(stagedPackageDir, "manifest.json"), `${JSON.stringify(packageManifest, null, 2)}\n`, "utf-8");
  const manifestFile = { path: "manifest.json", sha256: sha256(path.join(stagedPackageDir, "manifest.json")) };
  const sums = [...files, manifestFile].map((file) => `${file.sha256}  ${file.path}`);
  fs.writeFileSync(path.join(stagedPackageDir, "SHA256SUMS"), `${sums.join("\n")}\n`, "utf-8");
  run("tar", ["-czf", stagedPackageArchive, "-C", stagedPackageDir, "."]);
  return stagedPackageArchive;
}

function runTarPackageSmokeTests(archivePath) {
  const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-package-isolated-"));
  const extractDir = path.join(isolatedRoot, "extracted");
  const callerDir = path.join(isolatedRoot, "caller");
  const sourceDir = path.join(isolatedRoot, "source");
  fs.mkdirSync(extractDir, { recursive: true });
  fs.mkdirSync(callerDir, { recursive: true });
  fs.mkdirSync(sourceDir, { recursive: true });
  try {
    run("tar", ["-xzf", archivePath, "-C", extractDir]);
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"));
    const manifestPath = path.join(extractDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    if (manifest.version !== pkg.version || manifest.target !== platformName || !Array.isArray(manifest.files)) {
      throw new Error("Extracted package manifest does not match the current host package");
    }
    for (const file of manifest.files) {
      const relative = file.path.replace(/\\/g, "/");
      if (path.posix.isAbsolute(relative) || relative.split("/").includes("..")) {
        throw new Error(`Unsafe path in generated package manifest: ${file.path}`);
      }
      const fullPath = path.resolve(extractDir, ...relative.split("/"));
      if (!fullPath.startsWith(`${path.resolve(extractDir)}${path.sep}`) || !fs.existsSync(fullPath)) {
        throw new Error(`Package payload is missing or outside the extraction directory: ${file.path}`);
      }
      if (sha256(fullPath) !== file.sha256 || fs.statSync(fullPath).size !== file.sizeBytes) {
        throw new Error(`Package payload integrity mismatch: ${file.path}`);
      }
    }

    const sums = fs.readFileSync(path.join(extractDir, "SHA256SUMS"), "utf-8").trim().split(/\r?\n/);
    if (sums.length !== manifest.files.length + 1) throw new Error("SHA256SUMS does not cover every package payload and manifest");
    for (const line of sums) {
      const [expectedHash, ...nameParts] = line.trim().split(/\s+/);
      const name = nameParts.join("  ");
      const fullPath = path.resolve(extractDir, ...name.replace(/\\/g, "/").split("/"));
      if (!fullPath.startsWith(`${path.resolve(extractDir)}${path.sep}`) || !fs.existsSync(fullPath) || sha256(fullPath) !== expectedHash) {
        throw new Error(`Extracted package SHA256SUMS verification failed for ${name}`);
      }
    }
    const executable = path.join(extractDir, exeName);
    const runExtracted = (name, args, expectedCode, expectedText) => {
      const result = spawnSync(executable, args, { cwd: callerDir, encoding: "utf-8", timeout: 30000 });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      if (result.error || result.status !== expectedCode || !output.includes(expectedText)) {
        throw new Error(`Extracted package smoke failed (${name}): exit=${result.status}; output=${output.slice(0, 1000)}`);
      }
      console.log(`  ✓ Package ${name}`);
    };
    runExtracted("version", ["--version"], 0, `HKD ${pkg.version}`);
    runExtracted("help", ["--help"], 0, "USAGE:");

    const valid = path.join(sourceDir, "valid.hkd");
    fs.writeFileSync(valid, 'println("HKD extracted package passed");\n', "utf-8");
    runExtracted("valid program from a clean working directory", ["run", valid], 0, "HKD extracted package passed");
    const invalid = path.join(sourceDir, "invalid.hkd");
    fs.writeFileSync(invalid, "let = ;\n", "utf-8");
    runExtracted("invalid program diagnostic", ["run", invalid], 1, "HKD Error");
  } finally {
    fs.rmSync(isolatedRoot, { recursive: true, force: true });
  }
}

function runArchiveSmokeTests(stagedArchive) {
  if (!IS_WIN) return;
  const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-zip-isolated-"));
  const extractDir = path.join(isolatedRoot, "extracted");
  const callerDir = path.join(isolatedRoot, "different-working-directory");
  const sourceDir = path.join(isolatedRoot, "source-files");
  fs.mkdirSync(callerDir, { recursive: true });
  fs.mkdirSync(sourceDir, { recursive: true });
  try {
    const extractedFiles = extractVerifiedSingleFileZip(stagedArchive, extractDir);

  const extractedExe = path.join(extractDir, "hkd.exe");
  const run = (name, args, expectedCode, expectedText, cwd = callerDir) => {
    const res = spawnSync(extractedExe, args, { cwd, encoding: "utf-8", timeout: 30000 });
    const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
    if (res.error || res.status !== expectedCode || !output.includes(expectedText)) {
      throw new Error(`Archive smoke failed (${name}): exit=${res.status}; output=${output.slice(0, 1200)}; reason=${res.error?.message ?? ""}`);
    }
    console.log(`  ✓ ZIP ${name}`);
  };

  run("version", ["--version"], 0, "HKD 1.1.0");
  run("help", ["--help"], 0, "USAGE:");

  const validSource = path.join(sourceDir, "valid.hkd");
  fs.writeFileSync(validSource, 'print("HKD archive execution passed");\n', "utf-8");
  run("program from a different working directory", ["run", validSource], 0, "HKD archive execution passed");

  const invalidSource = path.join(sourceDir, "invalid.hkd");
  fs.writeFileSync(invalidSource, "let = ;\n", "utf-8");
  run("invalid program diagnostic", ["run", invalidSource], 1, "HKD Error");

    run("native-only option without companion runtime", ["run", validSource, "--vm"], 1, "native runtime");
  } finally {
    fs.rmSync(isolatedRoot, { recursive: true, force: true });
  }
}

function publishArtifacts(stagedArchive, packageArchive) {
  const manifestPath = path.join(distDir, "artifacts.json");
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
    : (() => {
        const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"));
        return {
          name: pkg.name,
          version: pkg.version,
          releaseName: `HKD ${pkg.version} host package`,
          compilerVersion: pkg.version,
          runtimeVersion: pkg.version,
          edition: "2026",
          buildProfile: "release",
          buildTimestamp: new Date().toISOString(),
          artifacts: [],
          inventoryNote: "Generated from the current source for this host; this is not an official published release.",
        };
      })();
  if (!Array.isArray(manifest.artifacts)) throw new Error("Artifact manifest has no artifacts array");

  fs.mkdirSync(releaseDir, { recursive: true });
  fs.copyFileSync(stagedBundlePath, bundlePath);
  // The SEA config/blob are build intermediates and remain in staging. Windows may
  // hold the blob open after Node's SEA preparation step, so they are not release artifacts.
  let previousExeBackup;
  if (fs.existsSync(finalExePath)) {
    previousExeBackup = path.join(releaseDir, `${exeName}.pre-phase10.3-${Date.now()}.bak`);
    fs.renameSync(finalExePath, previousExeBackup);
  }
  const installTempPath = path.join(releaseDir, `.hkd-package-${crypto.randomBytes(8).toString("hex")}.tmp`);
  try {
    fs.copyFileSync(releaseExePath, installTempPath);
    if (sha256(installTempPath) !== sha256(releaseExePath)) throw new Error("Staged executable copy checksum mismatch");
    fs.renameSync(installTempPath, finalExePath);
  } catch (error) {
    if (fs.existsSync(installTempPath)) fs.unlinkSync(installTempPath);
    if (previousExeBackup && fs.existsSync(previousExeBackup) && !fs.existsSync(finalExePath)) fs.renameSync(previousExeBackup, finalExePath);
    throw error;
  }
  if (previousExeBackup) console.log(`Preserved previous local executable at ${previousExeBackup}`);

  const entries = [];
  const exeRel = path.relative(distDir, finalExePath).replace(/\\/g, "/");
  entries.push({ binaryName: exeRel, sourcePath: finalExePath, name: `hkd-1.1.0-${platformName}` });

  if (IS_WIN) {
    const archiveName = `hkd-v1.1.0-windows-${HOST_ARCH}.zip`;
    const finalArchive = path.join(distDir, "releases", archiveName);
    fs.copyFileSync(stagedArchive, finalArchive);
    entries.push({ binaryName: `releases/${archiveName}`, sourcePath: finalArchive, name: `hkd-1.1.0-${platformName}-zip` });
  }

  const packageName = path.basename(packageArchive);
  const finalPackageArchive = path.join(distDir, "releases", packageName);
  fs.copyFileSync(packageArchive, finalPackageArchive);
  entries.push({ binaryName: `releases/${packageName}`, sourcePath: finalPackageArchive, name: `hkd-${manifest.version}-${platformName}-package` });

  for (const entry of entries) {
    let artifact = manifest.artifacts.find((item) => item.binaryName === entry.binaryName);
    if (!artifact) {
      const format = entry.binaryName.endsWith(".zip")
        ? "zip-archive"
        : entry.binaryName.endsWith(".tar.gz")
          ? "tar-gzip-package"
          : "standalone-binary";
      artifact = { name: entry.name, target: platformName, architecture: process.arch, os: process.platform, binaryName: entry.binaryName, checksum: "", sizeBytes: 0, format };
      manifest.artifacts.push(artifact);
    }
    artifact.checksum = sha256(entry.sourcePath);
    artifact.sizeBytes = fs.statSync(entry.sourcePath).size;
    if (IS_WIN) artifact.tier = `Host-validated (Windows ${HOST_ARCH})`;
  }
  manifest.buildTimestamp = new Date().toISOString();
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

  const checksums = manifest.artifacts
    .filter((artifact) => fs.existsSync(path.join(distDir, artifact.binaryName)))
    .map((artifact) => `${sha256(path.join(distDir, artifact.binaryName))}  ${artifact.binaryName.replace(/\\/g, "/")}`);
  fs.writeFileSync(path.join(distDir, "SHA256SUMS"), `${checksums.join("\n")}\n`, "utf-8");
  fs.writeFileSync(path.join(distDir, "releases", "SHA256SUMS"), `${checksums.map((line) => line.replace(/^([a-f0-9]{64})  releases\//, "$1  ")).filter((line) => !line.endsWith(".zip") || IS_WIN).join("\n")}\n`, "utf-8");

  if (IS_WIN) {
    const notesPath = path.join(distDir, "releases", "RELEASE_NOTES.md");
    if (fs.existsSync(notesPath)) {
      let notes = fs.readFileSync(notesPath, "utf-8");
      notes = notes.replace(new RegExp(`^([a-f0-9]{64})  windows-${HOST_ARCH}\\/hkd\\.exe\\r?$`, "m"), `${sha256(finalExePath)}  windows-${HOST_ARCH}/hkd.exe`);
      const archiveName = `hkd-v1.1.0-windows-${HOST_ARCH}.zip`;
      notes = notes.replace(new RegExp(`^([a-f0-9]{64})  ${archiveName.replaceAll(".", "\\.")}\\r?$`, "m"), `${sha256(path.join(distDir, "releases", archiveName))}  ${archiveName}`);
      fs.writeFileSync(notesPath, notes, "utf-8");
    }
  }
  console.log("Updated artifact manifest and SHA-256 files from the packaged artifacts.");
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
      throw new Error(`Smoke test failed: ${name}`);
    }
    
    if (expectedOutputMatch && !combinedOutput.includes(expectedOutputMatch)) {
      console.error(`  FAIL: Output does not match expected pattern: "${expectedOutputMatch}"`);
      console.error(`  Actual output:\n${combinedOutput}`);
      throw new Error(`Smoke test output did not match: ${name}`);
    }
    console.log("  ✓ PASS");
  };

  runTest("Version Command", ["version"], 0, "HKD 1.1.0");
  runTest("Version flag", ["--version"], 0, "HKD 1.1.0");
  runTest("No-argument usage", [], 0, "USAGE:");
  runTest("Help Command", ["help"], 0, "USAGE:");
  runTest("Valid program execution", ["run", "examples/structs/structs.hkd"], 0, "=== HKD Structs ===");
  runTest("Missing file execution", ["run", "non_existent_file.hkd"], 1, "File not found");
  runTest("Invalid command", ["invalid-command-xyz"], 2, "Unknown command");

  console.log("Smoke test: Valid/invalid programs from isolated working directories");
  const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-sea-source-"));
  const callerDir = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-sea-caller-"));
  try {
    const validSource = path.join(sourceDir, "smoke.hkd");
    fs.writeFileSync(validSource, 'println("HKD clean-directory smoke passed");\n', "utf-8");
    const res = spawnSync(releaseExePath, ["run", validSource], {
      cwd: callerDir,
      encoding: "utf-8",
      stdio: "pipe",
      timeout: 30000,
    });
    const combinedOutput = (res.stdout ?? "") + (res.stderr ?? "");
    if (res.error || res.status !== 0 || !combinedOutput.includes("HKD clean-directory smoke passed")) {
      console.error(`  FAIL: Expected clean-directory program to run successfully (exit ${res.status ?? 1})`);
      console.error(`  Combined output:\n${combinedOutput}`);
      throw new Error(`Clean-directory execution failed: ${res.error?.message ?? "unexpected exit or output"}`);
    }
    console.log("  ✓ PASS");

    runTest("JIT unavailable diagnostic", ["run", validSource, "--jit"], 2, "JIT execution is not implemented");
    runTest("JIT stats unavailable diagnostic", ["run", validSource, "--jit-stats"], 2, "JIT execution is not implemented");

    const invalidSource = path.join(sourceDir, "invalid.hkd");
    fs.writeFileSync(invalidSource, "let = ;\n", "utf-8");
    runTest("Invalid program diagnostic", ["run", invalidSource], 1, "HKD Error");
  } finally {
    fs.rmSync(sourceDir, { recursive: true, force: true });
    fs.rmSync(callerDir, { recursive: true, force: true });
  }

  console.log("=== All Standalone Smoke Tests Passed! ===\n");
}

function main() {
  try {
    clean();
    build();
    bundle();
    generateBlob();
    packageBinary();
    runSmokeTests();
    let stagedArchive;
    if (IS_WIN) {
      stagedArchive = makeWindowsArchive();
      runArchiveSmokeTests(stagedArchive);
    }
    const packageArchive = makeTarPackage();
    runTarPackageSmokeTests(packageArchive);
    publishArtifacts(stagedArchive, packageArchive);
    console.log("Packaging process completed successfully!");
  } catch (error) {
    console.error("Packaging failed:", error);
    process.exitCode = 1;
  } finally {
    if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

main();
