import { describe, it, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { generateCycloneDxSbom, writeSbomJson } from "../../src/deploy/sbom.js";
import { serializeLockfileV2, LockfileV2 } from "../../src/package-manager/lockfile.js";

describe("Phase 14AH & 14AI — Supply-Chain Security & CycloneDX SBOM", () => {
  const tempDir = path.join(os.tmpdir(), `hkd-sbom-test-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, "hkd.toml"), 'name = "microservice"\nversion = "2.1.0"\n');

    const lock: LockfileV2 = {
      version: 2,
      resolver: "2.0",
      packages: [
        {
          name: "hkd-logger",
          version: "1.0.4",
          source: "registry",
          checksum: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          dependencies: [],
        },
      ],
    };
    fs.writeFileSync(path.join(tempDir, "hkd.lock"), serializeLockfileV2(lock));
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("generates valid CycloneDX 1.5 JSON SBOM", () => {
    const sbom = generateCycloneDxSbom(tempDir);
    expect(sbom.bomFormat).toBe("CycloneDX");
    expect(sbom.specVersion).toBe("1.5");
    expect(sbom.serialNumber).toMatch(/^urn:uuid:/);

    expect(sbom.metadata.component.name).toBe("microservice");
    expect(sbom.metadata.component.version).toBe("2.1.0");

    const compNames = sbom.components.map((c) => c.name);
    expect(compNames).toContain("hkd-compiler");
    expect(compNames).toContain("hkd-runtime");
    expect(compNames).toContain("hkd-logger");

    const loggerComp = sbom.components.find((c) => c.name === "hkd-logger");
    expect(loggerComp?.hashes?.[0].alg).toBe("SHA-256");
    expect(loggerComp?.hashes?.[0].content).toHaveLength(64);
  });

  it("writes sbom.json to destination", () => {
    const outPath = writeSbomJson(tempDir);
    expect(fs.existsSync(outPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(outPath, "utf-8"));
    expect(parsed.bomFormat).toBe("CycloneDX");
  });
});
