const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const cli = path.resolve("dist/cli/main.js");
function run(args, cwd = process.cwd()) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", timeout: 30000 });
}

const version = run(["--version"]);
assert.equal(version.status, 0, version.stderr);
assert.match(version.stdout, /HKD 1\.1\.0/);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-ci-smoke-"));
try {
  const validPath = path.join(tempDir, "valid.hkd");
  fs.copyFileSync(path.resolve("src/main.hkd"), validPath);
  const valid = run(["run", validPath], tempDir);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /HKD Production Runtime initialized: v1\.1\.0/);

  const invalidPath = path.join(tempDir, "invalid.hkd");
  fs.writeFileSync(invalidPath, "let = ;\n", "utf8");
  const invalid = run(["run", invalidPath], tempDir);
  assert.notEqual(invalid.status, 0, "invalid HKD source must return a non-zero exit code");
  assert.match(`${invalid.stdout}\n${invalid.stderr}`, /error|expected|unexpected/i);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("CLI smoke checks passed: version, valid source, invalid source, and exit status.");
