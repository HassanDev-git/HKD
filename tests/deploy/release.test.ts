import { describe, it, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { buildReleaseBundle } from "../../src/deploy/release.js";
import { verifyArtifact } from "../../src/deploy/artifact.js";

describe("Phase 14E — Release & Distribution Pipeline", () => {
  const tempDir = path.join(os.tmpdir(), `hkd-release-test-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "hkd.toml"),
      'name = "release-test-app"\nversion = "1.0.0"\nmain = "src/main.hkd"\n'
    );
    fs.writeFileSync(path.join(tempDir, "src", "main.hkd"), 'println("hello release")\n');
    fs.writeFileSync(path.join(tempDir, "README.md"), "# Release Test App\n");
    fs.writeFileSync(path.join(tempDir, "LICENSE"), "MIT License\n");
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("orchestrates a full release bundle packaging and verification", () => {
    // Create a dummy binary simulating standalone compilation
    const dummyBin = path.join(tempDir, "release-test-app.exe");
    fs.writeFileSync(dummyBin, "DUMMY_STANDALONE_BYTES");

    const outDir = path.join(tempDir, "releases");
    const res = buildReleaseBundle(dummyBin, {
      projectDir: tempDir,
      target: "x86_64-windows",
      profile: "release",
      outDir,
    });

    expect(res.ok).toBe(true);
    expect(res.bundleDir).toBeDefined();

    const bundle = res.bundleDir!;
    expect(fs.existsSync(path.join(bundle, "release-test-app.exe"))).toBe(true);
    expect(fs.existsSync(path.join(bundle, "artifact.json"))).toBe(true);
    expect(fs.existsSync(path.join(bundle, "SHA256SUMS"))).toBe(true);
    expect(fs.existsSync(path.join(bundle, "sbom.json"))).toBe(true);
    expect(fs.existsSync(path.join(bundle, "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(bundle, "LICENSE"))).toBe(true);

    const verify = verifyArtifact(bundle);
    expect(verify.valid).toBe(true);
    expect(verify.metadata?.name).toBe("release-test-app");
  });

  it("fails cleanly when project manifest is missing", () => {
    const emptyDir = path.join(tempDir, "empty");
    fs.mkdirSync(emptyDir, { recursive: true });

    const dummyBin = path.join(tempDir, "dummy");
    fs.writeFileSync(dummyBin, "BYTES");

    const res = buildReleaseBundle(dummyBin, {
      projectDir: emptyDir,
      target: "x86_64-windows",
      profile: "release",
    });

    expect(res.ok).toBe(false);
    expect(res.message).toContain("Missing hkd.toml");
  });
});
