/**
 * HKD Phase 9 Environment Metadata Extractor (CommonJS)
 */

const os = require("os");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function getSystemMetadata(rootDir = process.cwd()) {
  const cpus = os.cpus();
  const cpuModel = cpus && cpus.length > 0 ? cpus[0].model.trim() : "Unknown CPU";
  const cpuCount = cpus ? cpus.length : 1;
  const totalMem = os.totalmem();

  let hkdVer = "1.1.0";
  try {
    const pkgPath = path.join(rootDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      hkdVer = pkg.version || hkdVer;
    }
  } catch {}

  let tsVer = "5.5.2";
  try {
    const pkgPath = path.join(rootDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      tsVer = pkg.devDependencies?.typescript?.replace(/[\^~]/g, "") || tsVer;
    }
  } catch {}

  let gitCommit = "unknown";
  let gitBranch = "unknown";
  let isDirty = false;

  try {
    const rev = spawnSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf-8" });
    if (rev.status === 0 && rev.stdout) {
      gitCommit = rev.stdout.trim();
    }
    const br = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: rootDir, encoding: "utf-8" });
    if (br.status === 0 && br.stdout) {
      gitBranch = br.stdout.trim();
    }
    const st = spawnSync("git", ["status", "--porcelain"], { cwd: rootDir, encoding: "utf-8" });
    if (st.status === 0) {
      isDirty = st.stdout.trim().length > 0;
    }
  } catch {}

  return {
    os: os.platform(),
    architecture: os.arch(),
    cpuModel,
    cpuLogicalCores: cpuCount,
    totalMemoryBytes: totalMem,
    totalMemoryMb: Math.round(totalMem / (1024 * 1024)),
    nodeVersion: process.version,
    typescriptVersion: tsVer,
    hkdVersion: hkdVer,
    git: {
      commit: gitCommit,
      branch: gitBranch,
      dirty: isDirty,
    },
    buildMode: process.env.NODE_ENV || "production",
    runnerVersion: "phase9-runner-1.0.0",
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  getSystemMetadata,
};
