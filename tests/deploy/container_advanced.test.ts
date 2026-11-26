import { describe, it, expect } from "@jest/globals";
import { generateDockerfile, generateDockerignore } from "../../src/deploy/container.js";

describe("Phase 14 Container Invariant & Security Specifications", () => {
  it("enforces explicit non-root user UID 10001", () => {
    const df = generateDockerfile();
    expect(df).toMatch(/useradd\s+--system\s+--uid\s+10001/);
    expect(df).toMatch(/groupadd\s+--system\s+--gid\s+10001/);
    expect(df).toContain("USER hkd:hkd");
  });

  it("uses a supported Node LTS builder and deterministic dependency installation", () => {
    const df = generateDockerfile();
    expect(df).toContain("FROM node:22-bookworm-slim AS builder");
    expect(df).toContain("RUN npm ci");
    expect(df).not.toContain("npm install");
    expect(df).not.toContain("|| true");
  });

  it("uses a slim Node runtime", () => {
    const df = generateDockerfile();
    expect(df).toContain("FROM node:22-bookworm-slim AS runtime");
  });

  it("copies the CLI and selected HKD program and runs as non-root", () => {
    const df = generateDockerfile();
    expect(df).toContain("COPY --from=builder --chown=hkd:hkd /build/dist ./dist");
    expect(df).toContain("COPY --chown=hkd:hkd src/main.hkd /app/main.hkd");
    expect(df).toContain("USER hkd:hkd");
  });

  it("binds executable to ENTRYPOINT array format", () => {
    const df = generateDockerfile();
    expect(df).toContain('ENTRYPOINT ["node", "/app/dist/cli/main.js", "run", "/app/main.hkd"]');
  });

  it("does not assume a network service or health endpoint", () => {
    const df = generateDockerfile({ port: 9000 });
    expect(df).not.toContain("HEALTHCHECK");
    expect(df).not.toContain("EXPOSE");
  });

  it("rejects container entry paths that escape the build context", () => {
    expect(() => generateDockerfile({ entry: "../outside.hkd" })).toThrow(/project-relative path/);
  });

  it("excludes secret files in dockerignore", () => {
    const ign = generateDockerignore();
    expect(ign).toContain("*.env*");
    expect(ign).toContain("*.key");
    expect(ign).toContain("*.pem");
    expect(ign).toContain("*.secret");
    expect(ign).toContain(".git/");
    expect(ign).toContain("node_modules/");
    expect(ign).toContain("dist/");
    expect(ign).toContain("target/");
  });
});
