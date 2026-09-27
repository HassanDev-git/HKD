import { describe, test, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { packArchive, unpackArchive, ARCHIVE_MAGIC } from "../../src/package-manager/archive.js";
import { ContentAddressedCache } from "../../src/package-manager/cache.js";
import { HkdManifest } from "../../src/package-manager/index.js";

describe("HKD Phase 12F & 12G — Package Archive 2.0 & Content-Addressed Cache", () => {
  const tempDir = path.resolve(".hkd/test_archive");
  const cacheDir = path.resolve(".hkd/test_cache");

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(cacheDir, { recursive: true, force: true });
    } catch {}
  });

  const sampleManifest: HkdManifest = {
    name: "test-pkg",
    version: "1.0.0",
    description: "A test package",
    main: "src/index.hkd",
    dependencies: {},
    devDependencies: {},
  };

  test("Produces deterministic archive with identical checksum", () => {
    const pkgSourceDir = path.join(tempDir, "pkg_source");
    fs.mkdirSync(path.join(pkgSourceDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(pkgSourceDir, "src", "index.hkd"), `print("hello");\n`);
    fs.writeFileSync(path.join(pkgSourceDir, "README.md"), `# Readme\n`);

    // Pack twice
    const pack1 = packArchive(pkgSourceDir, sampleManifest);
    const pack2 = packArchive(pkgSourceDir, sampleManifest);

    expect(pack1.fileCount).toBe(2);
    expect(pack1.checksum).toBe(pack2.checksum);
    expect(pack1.buffer.equals(pack2.buffer)).toBe(true);
  });

  test("Unpacks archive cleanly with checksum verification", () => {
    const pkgSourceDir = path.join(tempDir, "pkg_source");
    const pack = packArchive(pkgSourceDir, sampleManifest);

    const unpackDest = path.join(tempDir, "pkg_dest");
    const res = unpackArchive(pack.buffer, unpackDest, pack.checksum);

    expect(res.manifest.name).toBe("test-pkg");
    expect(res.manifest.version).toBe("1.0.0");
    expect(res.files).toContain("src/index.hkd");
    expect(res.files).toContain("README.md");

    const content = fs.readFileSync(path.join(unpackDest, "src", "index.hkd"), "utf-8");
    expect(content).toBe(`print("hello");\n`);
  });

  test("Rejects corrupted magic header", () => {
    const pkgSourceDir = path.join(tempDir, "pkg_source");
    const pack = packArchive(pkgSourceDir, sampleManifest);

    // Corrupt magic
    const corruptedBuf = Buffer.from(pack.buffer);
    corruptedBuf.write("BADMAGIC\n", 0, "ascii");

    const unpackDest = path.join(tempDir, "corrupted_dest");
    expect(() => unpackArchive(corruptedBuf, unpackDest)).toThrow(/error\[SEC002\]/);
  });

  test("Rejects checksum mismatch", () => {
    const pkgSourceDir = path.join(tempDir, "pkg_source");
    const pack = packArchive(pkgSourceDir, sampleManifest);

    const unpackDest = path.join(tempDir, "mismatch_dest");
    expect(() => unpackArchive(pack.buffer, unpackDest, "sha256:wrong_digest")).toThrow(/error\[SEC001\]/);
  });

  test("ContentAddressedCache stores, retrieves, lists, and verifies packages", () => {
    const cache = new ContentAddressedCache(cacheDir);

    const pkgSourceDir = path.join(tempDir, "pkg_source");
    const pack = packArchive(pkgSourceDir, sampleManifest);

    // 1. Store
    const storedDir = cache.store(pack.checksum, pack.buffer, sampleManifest);
    expect(fs.existsSync(storedDir)).toBe(true);
    expect(cache.has(pack.checksum)).toBe(true);

    // 2. Retrieve
    const cached = cache.get(pack.checksum);
    expect(cached).not.toBeNull();
    expect(cached!.manifest.name).toBe("test-pkg");
    expect(cached!.manifest.version).toBe("1.0.0");

    // 3. List
    const list = cache.list();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((e) => e.name === "test-pkg")).toBe(true);

    // 4. Verify
    const verifyRes = cache.verify();
    expect(verifyRes.valid).toBe(true);
    expect(verifyRes.corrupted).toHaveLength(0);

    // 5. Clean
    const cleanRes = cache.clean();
    expect(cleanRes.count).toBeGreaterThanOrEqual(1);
    expect(cache.list()).toHaveLength(0);
  });
});
