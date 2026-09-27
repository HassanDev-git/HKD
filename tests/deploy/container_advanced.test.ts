import { describe, it, expect } from "@jest/globals";
import { generateDockerfile, generateDockerignore } from "../../src/deploy/container.js";

describe("Phase 14 Container Invariant & Security Specifications", () => {
  it("enforces explicit non-root user UID 10001", () => {
    const df = generateDockerfile();
    expect(df).toMatch(/adduser\s+-S\s+-u\s+10001/);
    expect(df).toMatch(/addgroup\s+-S\s+-g\s+10001/);
    expect(df).toContain("USER hkd:hkd");
  });

  it("ensures builder stage uses Node 20 alpine", () => {
    const df = generateDockerfile();
    expect(df).toContain("FROM node:20-alpine AS builder");
  });

  it("ensures runtime stage uses minimal Alpine", () => {
    const df = generateDockerfile();
    expect(df).toContain("FROM alpine:3.20 AS runtime");
  });

  it("copies only release executable from builder into runtime", () => {
    const df = generateDockerfile();
    expect(df).toMatch(/COPY --from=builder --chown=hkd:hkd \/build\/target\/release\/server \/app\/server/);
  });

  it("binds executable to ENTRYPOINT array format", () => {
    const df = generateDockerfile();
    expect(df).toContain('ENTRYPOINT ["/app/server"]');
  });

  it("configures healthcheck probe with wget", () => {
    const df = generateDockerfile({ port: 9000 });
    expect(df).toContain("HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3");
    expect(df).toContain("wget -qO- http://127.0.0.1:9000/health || exit 1");
  });

  it("exposes parameterized port", () => {
    const df80 = generateDockerfile({ port: 80 });
    expect(df80).toContain("EXPOSE 80");

    const df3000 = generateDockerfile({ port: 3000 });
    expect(df3000).toContain("EXPOSE 3000");
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
