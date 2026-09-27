import { describe, test, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { PackageManager2 } from "../../src/package-manager/manager.js";
import { MockRegistryClient } from "../../src/package-manager/registry/registry-mock.js";
import { packArchive } from "../../src/package-manager/archive.js";
import { auditProject } from "../../src/package-manager/audit.js";
import { isWorkspace, loadWorkspace } from "../../src/package-manager/workspace.js";
import { verifyBuildReproducibility } from "../../src/package-manager/reproducible.js";

describe("HKD Phase 12J through 12T — End-to-End Package Workflows", () => {
  const sandbox = path.resolve(".hkd/test_sandbox");
  const cacheDir = path.join(sandbox, "cache");

  beforeAll(() => {
    fs.mkdirSync(sandbox, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(sandbox, { recursive: true, force: true });
    } catch {}
  });

  test("Package initialization, packing, and publishing", async () => {
    const mockRegistry = new MockRegistryClient();
    const pm = new PackageManager2({ cacheDir, registry: mockRegistry });

    const pkgDir = path.join(sandbox, "my-lib");
    const initRes = pm.init(pkgDir, "my-lib");
    expect(initRes.ok).toBe(true);
    expect(fs.existsSync(path.join(pkgDir, "hkd.toml"))).toBe(true);

    // Pack
    const packRes = pm.pack(pkgDir);
    expect(fs.existsSync(packRes.path)).toBe(true);
    expect(packRes.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);

    // Publish
    const pubRes = await pm.publish(pkgDir);
    expect(pubRes.ok).toBe(true);

    // Verify published in registry
    const info = await pm.info("my-lib");
    expect(info).not.toBeNull();
    expect(info!.name).toBe("my-lib");
    expect(info!.versions["0.1.0"]).toBeDefined();
  });

  test("Add, install, vendor, and remove package workflows", async () => {
    const mockRegistry = new MockRegistryClient();
    const pm = new PackageManager2({ cacheDir, registry: mockRegistry });

    // Seed registry with a dependency: "utils@1.0.0"
    const utilsDir = path.join(sandbox, "utils_src");
    fs.mkdirSync(path.join(utilsDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(utilsDir, "src", "main.hkd"), `export fn double(x) { return x * 2; }\n`);
    const utilsManifest = {
      name: "utils",
      version: "1.0.0",
      dependencies: {},
      devDependencies: {},
    };
    const utilsPack = packArchive(utilsDir, utilsManifest);
    await mockRegistry.publishPackage(utilsManifest, utilsPack.buffer);

    // Consumer project: "consumer-app"
    const appDir = path.join(sandbox, "consumer-app");
    pm.init(appDir, "consumer-app");

    // Add utils
    const addRes = await pm.add(appDir, "utils@^1.0.0");
    expect(addRes.ok).toBe(true);

    // Verify installed in .hkd/deps/utils
    expect(fs.existsSync(path.join(appDir, ".hkd", "deps", "utils", "src", "main.hkd"))).toBe(true);

    // Vendor dependencies
    const vendorRes = await pm.vendor(appDir);
    expect(vendorRes.ok).toBe(true);
    expect(fs.existsSync(path.join(appDir, "vendor", "utils", "src", "main.hkd"))).toBe(true);

    // Audit project
    const auditRes = auditProject(appDir);
    expect(auditRes.ok).toBe(true);
    expect(auditRes.issues.filter((i) => i.severity === "critical")).toHaveLength(0);

    // Remove dependency
    const removeRes = await pm.remove(appDir, "utils");
    expect(removeRes.ok).toBe(true);
    expect(fs.existsSync(path.join(appDir, ".hkd", "deps", "utils"))).toBe(false);
  });

  test("Workspace detection and member loading", () => {
    const wsDir = path.join(sandbox, "ws_root");
    fs.mkdirSync(wsDir, { recursive: true });

    fs.writeFileSync(
      path.join(wsDir, "hkd.toml"),
      `[workspace]\nmembers = ["packages/*"]\n`
    );

    const pkg1 = path.join(wsDir, "packages", "pkg-a");
    const pkg2 = path.join(wsDir, "packages", "pkg-b");
    fs.mkdirSync(path.join(pkg1, "src"), { recursive: true });
    fs.mkdirSync(path.join(pkg2, "src"), { recursive: true });

    fs.writeFileSync(path.join(pkg1, "hkd.toml"), `[package]\nname = "pkg-a"\nversion = "0.1.0"\n`);
    fs.writeFileSync(path.join(pkg2, "hkd.toml"), `[package]\nname = "pkg-b"\nversion = "0.2.0"\n`);

    expect(isWorkspace(wsDir)).toBe(true);

    const ws = loadWorkspace(wsDir);
    expect(ws).not.toBeNull();
    expect(ws!.members.map((m) => m.name)).toEqual(["pkg-a", "pkg-b"]);
  });

  test("Reproducible builds verification", () => {
    const srcFile = path.join(sandbox, "repro.hkd");
    fs.writeFileSync(srcFile, `let a = 10;\nlet b = 20;\nprint(a + b);\n`);

    const cliPath = path.resolve("dist/cli/main.js");
    const repro = verifyBuildReproducibility(srcFile, cliPath);

    expect(repro.reproducible).toBe(true);
    expect(repro.hashA).toBe(repro.hashB);
  });
});
