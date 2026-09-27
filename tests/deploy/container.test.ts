import { describe, it, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { generateDockerfile, generateDockerignore, initContainer } from "../../src/deploy/container.js";

describe("Phase 14O & 14P — Multi-Stage Containerization Engine", () => {
  it("generates hardened multi-stage Dockerfile", () => {
    const dockerfile = generateDockerfile({ port: 8080, target: "x86_64-linux" });

    // Stage 1: Builder
    expect(dockerfile).toContain("AS builder");
    expect(dockerfile).toContain("npm run build");

    // Stage 2: Runtime
    expect(dockerfile).toContain("AS runtime");
    expect(dockerfile).toContain("addgroup -S -g 10001 hkd");
    expect(dockerfile).toContain("USER hkd:hkd");
    expect(dockerfile).toContain("EXPOSE 8080");
    expect(dockerfile).toContain("HEALTHCHECK");
    expect(dockerfile).toContain("http://127.0.0.1:8080/health");
  });

  it("generates .dockerignore excluding sensitive files and build artifacts", () => {
    const dockerignore = generateDockerignore();
    expect(dockerignore).toContain(".git/");
    expect(dockerignore).toContain("*.key");
    expect(dockerignore).toContain("*.pem");
    expect(dockerignore).toContain("*.env*");
    expect(dockerignore).toContain("node_modules/");
  });

  it("initializes container configuration in project directory", () => {
    const tempDir = path.join(os.tmpdir(), `hkd-container-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const res = initContainer(tempDir, { port: 9090 });
      expect(fs.existsSync(res.dockerfile)).toBe(true);
      expect(fs.existsSync(res.dockerignore)).toBe(true);

      const content = fs.readFileSync(res.dockerfile, "utf-8");
      expect(content).toContain("EXPOSE 9090");
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });
});
