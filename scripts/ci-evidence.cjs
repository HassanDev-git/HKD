const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const outputDir = process.env.HKD_CI_EVIDENCE_DIR || "artifacts/ci-evidence";
fs.mkdirSync(outputDir, { recursive: true });

const evidence = {
  recordedAt: new Date().toISOString(),
  runner: {
    os: process.env.RUNNER_OS || os.platform(),
    architecture: process.env.RUNNER_ARCH || os.arch(),
    image: process.env.ImageOS || null,
    imageVersion: process.env.ImageVersion || null,
    node: process.version,
    zigPackage: process.env.ZIG_PACKAGE || null,
    zigVersion: process.env.HKD_ZIG_VERSION || null,
    nativeRuntimeBuildMode:
      process.env.HKD_PREBUILT_RUNTIME === "true"
        ? "ReleaseFast cross-built on Ubuntu x64 and executed on Windows ARM64"
        : "ReleaseFast built and executed on native runner",
    nativeRuntimeSha256: process.env.HKD_NATIVE_RUNTIME_SHA256 || null,
  },
  workflow: {
    name: process.env.GITHUB_WORKFLOW || null,
    runId: process.env.GITHUB_RUN_ID || null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    sha: process.env.GITHUB_SHA || null,
    ref: process.env.GITHUB_REF || null,
    matrixPlatform: process.env.HKD_MATRIX_PLATFORM || null,
    nodeVersion: process.env.HKD_MATRIX_NODE || null,
  },
  outcomes: JSON.parse(process.env.HKD_CI_OUTCOMES || "{}"),
};

const manifestPath = path.join(process.env.HKD_DIST_DIR || "dist", "artifacts.json");
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  evidence.packages = (manifest.artifacts || [])
    .filter((artifact) => artifact.format === "tar-gzip-package")
    .map(({ name, target, architecture, os: artifactOS, binaryName, checksum, sizeBytes }) => ({
      name,
      target,
      architecture,
      os: artifactOS,
      binaryName,
      sha256: checksum,
      sizeBytes,
    }));
}

const filename = `${(process.env.HKD_MATRIX_PLATFORM || os.platform()).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-node-${process.env.HKD_MATRIX_NODE || process.versions.node}.json`;
const destination = path.join(outputDir, filename);
fs.writeFileSync(destination, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`Wrote CI execution evidence to ${destination}`);
