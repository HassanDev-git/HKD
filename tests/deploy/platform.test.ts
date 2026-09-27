import { describe, it, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { PlatformRegistry } from "../../src/deploy/platform/platform-manager.js";
import { GenericServerAdapter } from "../../src/deploy/platform/generic-server.js";
import { DockerAdapter } from "../../src/deploy/platform/docker.js";
import { GithubActionsAdapter } from "../../src/deploy/platform/github-actions.js";
import { VercelAdapter } from "../../src/deploy/platform/vercel.js";

describe("Phase 14W & 14X — Platform Adapters & Integration Matrix", () => {
  const tempDir = path.join(os.tmpdir(), `hkd-platform-test-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, "hkd.toml"), 'name = "test-service"\nversion = "0.1.0"\n');
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("registers and queries platform adapters", () => {
    const registry = new PlatformRegistry();
    registry.register(new GenericServerAdapter());
    registry.register(new DockerAdapter());
    registry.register(new GithubActionsAdapter());
    registry.register(new VercelAdapter());

    expect(registry.getAll().length).toBe(4);
    expect(registry.get("docker")?.tier).toBe("SUPPORTED");
    expect(registry.get("vercel")?.tier).toBe("EXPERIMENTAL");
  });

  it("generates systemd service and deploy.sh via GenericServerAdapter", async () => {
    const adapter = new GenericServerAdapter();
    const outDir = path.join(tempDir, "deploy-out");
    const files = await adapter.generateBundle(tempDir, outDir);

    expect(files.length).toBe(2);
    const serviceContent = fs.readFileSync(path.join(outDir, "test-service.service"), "utf-8");
    expect(serviceContent).toContain("Description=test-service HKD Production Service");
    expect(serviceContent).toContain("ExecStart=/opt/test-service/test-service");

    const deploySh = fs.readFileSync(path.join(outDir, "deploy.sh"), "utf-8");
    expect(deploySh).toContain("systemctl restart");
  });

  it("generates GitHub Actions CI and Release workflows", async () => {
    const adapter = new GithubActionsAdapter();
    const files = await adapter.generateBundle(tempDir, tempDir);

    expect(files.length).toBe(2);
    expect(files[0]).toContain("ci.yml");
    expect(files[1]).toContain("release.yml");

    const ciContent = fs.readFileSync(files[0], "utf-8");
    expect(ciContent).toContain("matrix:");
    expect(ciContent).toContain("ubuntu-latest");
  });

  it("flags Vercel serverless adapter as experimental", async () => {
    const adapter = new VercelAdapter();
    expect(adapter.tier).toBe("EXPERIMENTAL");
    const val = await adapter.validate(tempDir);
    expect(val.warnings.some((w) => w.includes("EXPERIMENTAL"))).toBe(true);
  });
});
