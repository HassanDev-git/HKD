import { describe, it, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  computeSha256,
  generateArtifactMetadata,
  writeArtifactMetadata,
  generateSha256Sums,
  verifyArtifact,
} from "../../src/deploy/artifact.js";
import { parseTarget } from "../../src/deploy/targets.js";
import { resolveProfile } from "../../src/deploy/profiles.js";

describe("Phase 14D & 14F — Release Artifact & Checksum Integrity Engine", () => {
  const tempDir = path.join(os.tmpdir(), `hkd-artifact-test-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("computes deterministic SHA-256 digests", () => {
    const filePath = path.join(tempDir, "sample.txt");
    fs.writeFileSync(filePath, "HKD Production Deployment Engine", "utf-8");
    const sha = computeSha256(filePath);
    expect(sha).toHaveLength(64);
    expect(computeSha256(filePath)).toBe(sha);
  });

  it("generates and writes artifact.json metadata", () => {
    const dummyBin = path.join(tempDir, "server.exe");
    fs.writeFileSync(dummyBin, "MOCK_STANDALONE_BINARY", "utf-8");

    const target = parseTarget("x86_64-windows");
    const profile = resolveProfile("release");
    const meta = generateArtifactMetadata(dummyBin, "my-server", "1.2.0", target, profile);

    expect(meta.name).toBe("my-server");
    expect(meta.version).toBe("1.2.0");
    expect(meta.target).toBe("x86_64-windows");
    expect(meta.checksum).toHaveLength(64);

    const outMeta = writeArtifactMetadata(tempDir, meta);
    expect(fs.existsSync(outMeta)).toBe(true);
  });

  it("generates SHA256SUMS file without self-inclusion", () => {
    const f1 = path.join(tempDir, "file1.txt");
    fs.writeFileSync(f1, "file1 content");
    const sumsPath = generateSha256Sums(tempDir, ["file1.txt"]);
    expect(fs.existsSync(sumsPath)).toBe(true);

    const content = fs.readFileSync(sumsPath, "utf-8");
    expect(content).toContain("file1.txt");
    expect(content).not.toContain("SHA256SUMS");
  });

  it("verifies valid release directory artifact", () => {
    const res = verifyArtifact(tempDir);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.metadata?.name).toBe("my-server");
  });

  it("detects tampered binary checksum", () => {
    const dummyBin = path.join(tempDir, "server.exe");
    fs.appendFileSync(dummyBin, "TAMPERED_BYTES");

    const res = verifyArtifact(tempDir);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("Checksum mismatch"))).toBe(true);
  });

  it("reports error on missing target file or directory", () => {
    const res = verifyArtifact(path.join(tempDir, "non_existent"));
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain("not found");
  });
});
