const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { verifyArtifactInventory } = require("../dist/tooling/verify-release.js");

const project = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-release-manifest-"));
const payload = Buffer.from("HKD release manifest regression fixture\n");
const checksum = crypto.createHash("sha256").update(payload).digest("hex");
const artifact = {
  name: "hkd-1.1.2-windows-x64",
  target: "windows-x64",
  architecture: "x64",
  os: "win32",
  binaryName: "releases/hkd-1.1.2-windows-x64.zip",
  checksum,
  sizeBytes: payload.length,
  format: "zip-archive",
};

try {
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "hkd", version: "1.1.2" }));
  fs.mkdirSync(path.join(project, "dist", "releases"), { recursive: true });
  fs.writeFileSync(path.join(project, "dist", artifact.binaryName), payload);
  const manifest = { version: "1.1.2", compilerVersion: "1.1.2", runtimeVersion: "1.1.2", artifacts: [artifact] };
  fs.writeFileSync(path.join(project, "dist", "artifacts.json"), JSON.stringify(manifest));
  assert.deepEqual(verifyArtifactInventory(project), { passed: true, checked: 1, errors: [] });

  manifest.compilerVersion = "1.1.1";
  fs.writeFileSync(path.join(project, "dist", "artifacts.json"), JSON.stringify(manifest));
  const stale = verifyArtifactInventory(project);
  assert.equal(stale.passed, false, "stale compiler version must fail artifact verification");
  assert.match(stale.errors.join("\n"), /compilerVersion 1\.1\.1 does not match compiler version 1\.1\.2/);
  console.log("Release manifest smoke passed: current metadata accepted; stale compiler metadata rejected.");
} finally {
  fs.rmSync(project, { recursive: true, force: true });
}
