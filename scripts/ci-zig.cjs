const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const packageName = process.env.ZIG_PACKAGE;
assert.ok(packageName, "ZIG_PACKAGE must identify the architecture-specific Zig package");
const executable = path.resolve("node_modules", "@zigc", packageName, "bin", process.platform === "win32" ? "zig.exe" : "zig");
assert.ok(fs.existsSync(executable), `Zig toolchain not installed: ${executable}`);
if (process.platform !== "win32") fs.chmodSync(executable, 0o755);

function zig(args) {
  const result = spawnSync(executable, args, { cwd: "native-runtime", stdio: "inherit" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `zig ${args.join(" ")} failed with status ${result.status}`);
}

zig(["version"]);
const zigVersion = spawnSync(executable, ["version"], { encoding: "utf8" });
assert.equal(zigVersion.status, 0, `Unable to read Zig version: ${zigVersion.stderr}`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${zigVersion.stdout.trim()}\n`);
zig(["test", "src/main.zig"]);
const outputDir = process.env.HKD_NATIVE_OUTPUT_DIR
  ? path.resolve(process.env.HKD_NATIVE_OUTPUT_DIR)
  : fs.mkdtempSync(path.join(os.tmpdir(), "hkd-ci-zig-release-"));
fs.mkdirSync(outputDir, { recursive: true });
const runtimePath = path.join(outputDir, process.platform === "win32" ? "hkd-runtime.exe" : "hkd-runtime");
if (process.env.HKD_PREBUILT_RUNTIME === "true") {
  assert.ok(fs.existsSync(runtimePath), `Prebuilt native runtime is missing: ${runtimePath}`);
  console.log(`Using target runtime cross-built by CI: ${runtimePath}`);
} else {
  zig(["build-exe", "src/main.zig", "-O", "ReleaseFast", `-femit-bin=${runtimePath}`]);
}
assert.ok(fs.existsSync(runtimePath), `Native runtime build output missing: ${runtimePath}`);
const runtimeSmoke = spawnSync(runtimePath, ["--version"], { encoding: "utf8", timeout: 10000 });
if (runtimeSmoke.error) throw runtimeSmoke.error;
assert.equal(runtimeSmoke.status, 0, `Native runtime execution failed: ${runtimeSmoke.stderr}`);
const expectedVersion = require("../package.json").version;
assert.match(`${runtimeSmoke.stdout}\n${runtimeSmoke.stderr}`, new RegExp(`HKD ${expectedVersion.replaceAll(".", "\\.")}`));
const runtimeSha256 = crypto.createHash("sha256").update(fs.readFileSync(runtimePath)).digest("hex");
if (process.env.HKD_EXPECTED_RUNTIME_SHA256) {
  assert.equal(runtimeSha256, process.env.HKD_EXPECTED_RUNTIME_SHA256, "Downloaded runtime SHA-256 does not match the cross-build job output");
}
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `runtime_sha256=${runtimeSha256}\n`);
console.log(`Zig tests and target runtime startup passed for ${packageName}: ${runtimePath} (SHA-256 ${runtimeSha256})`);
