const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const zig = path.resolve("node_modules", "@zigc", "linux-x64", "bin", "zig");
const runtimePath = path.resolve("native-runtime", "zig-out", "bin", "hkd-runtime.exe");
assert.ok(fs.existsSync(zig), `Linux x64 Zig toolchain not installed: ${zig}`);
fs.chmodSync(zig, 0o755);

function run(args) {
  const result = spawnSync(zig, args, { cwd: "native-runtime", stdio: "inherit" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `zig ${args.join(" ")} failed with status ${result.status}`);
}

run(["version"]);
fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
run([
  "build-exe",
  "src/main.zig",
  "-O",
  "ReleaseFast",
  "-target",
  "aarch64-windows",
  `-femit-bin=${runtimePath}`,
]);

const executable = fs.readFileSync(runtimePath);
assert.ok(executable.length > 1024, "Cross-built Windows ARM64 runtime is unexpectedly small");
assert.equal(executable.subarray(0, 2).toString("ascii"), "MZ", "Cross-built runtime is not a Windows PE executable");
const runtimeSha256 = crypto.createHash("sha256").update(executable).digest("hex");
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `runtime_sha256=${runtimeSha256}\n`);
console.log(`Cross-built Windows ARM64 ReleaseFast runtime: ${runtimePath} (${executable.length} bytes, SHA-256 ${runtimeSha256})`);
