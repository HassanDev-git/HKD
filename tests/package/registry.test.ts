import { describe, test, expect } from "@jest/globals";
import { MockRegistryClient } from "../../src/package-manager/registry/registry-mock.js";
import { packArchive } from "../../src/package-manager/archive.js";
import { HkdManifest } from "../../src/package-manager/index.js";
import * as fs from "fs";
import * as path from "path";

describe("HKD Phase 12H & 12I — Registry Protocol & Client", () => {
  const tempDir = path.resolve(".hkd/test_reg");

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test("Publish, metadata query, and download roundtrip", async () => {
    const client = new MockRegistryClient();

    const manifest: HkdManifest = {
      name: "json-parser",
      version: "1.0.0",
      description: "Fast JSON streaming parser",
      dependencies: {},
      devDependencies: {},
    };

    const pkgDir = path.join(tempDir, "pkg_json");
    fs.mkdirSync(path.join(pkgDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, "src", "index.hkd"), `export fn parse() {}\n`);

    const pack = packArchive(pkgDir, manifest);

    // 1. Publish
    const pubRes = await client.publishPackage(manifest, pack.buffer);
    expect(pubRes.ok).toBe(true);
    expect(pubRes.message).toContain("Successfully published");

    // 2. Query Metadata
    const meta = await client.getPackageMetadata("json-parser");
    expect(meta).not.toBeNull();
    expect(meta!.name).toBe("json-parser");
    expect(meta!.distTags["latest"]).toBe("1.0.0");
    expect(meta!.versions["1.0.0"]).toBeDefined();
    expect(meta!.versions["1.0.0"].checksum).toBe(pack.checksum);

    // 3. Download
    const download = await client.downloadPackage("json-parser", "1.0.0");
    expect(download.checksum).toBe(pack.checksum);
    expect(download.buffer.equals(pack.buffer)).toBe(true);

    // 4. Immutability: Attempt re-publishing same version must fail with REG009
    const rePub = await client.publishPackage(manifest, pack.buffer);
    expect(rePub.ok).toBe(false);
    expect(rePub.message).toContain("REG009");

    // 5. Search
    const searchResults = await client.searchPackages("json");
    expect(searchResults.length).toBe(1);
    expect(searchResults[0].name).toBe("json-parser");
  });

  test("Returns null for non-existent package", async () => {
    const client = new MockRegistryClient();
    const meta = await client.getPackageMetadata("unknown-pkg");
    expect(meta).toBeNull();

    await expect(client.downloadPackage("unknown-pkg", "1.0.0")).rejects.toThrow(/REG004/);
  });
});
