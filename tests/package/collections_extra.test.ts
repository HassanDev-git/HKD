/**
 * HKD 1.1 Package Ecosystem Test Suite
 * (tests/package/collections_extra.test.ts)
 *
 * Validates packing, unpacking, checksum integrity, and execution of the
 * `collections-extra` Edition 2027 package.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { unpackArchive } from "../../src/package-manager/archive.js";
import { runFile } from "../../src/runtime/index.js";

describe("HKD 1.1 Package Ecosystem — collections-extra", () => {
  const pkgDir = path.resolve(__dirname, "../../test-packages/collections-extra");
  const archivePath = path.join(pkgDir, "collections-extra-1.1.0.hkdpack");

  test("PKG-11-01: Archive file exists and has valid magic header", () => {
    expect(fs.existsSync(archivePath)).toBe(true);
    const buf = fs.readFileSync(archivePath);
    expect(buf.subarray(0, 9).toString()).toBe("HKDPACK2\n");
  });

  test("PKG-11-02: Successfully unpacks and verifies checksum integrity", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-unpack-test-"));
    try {
      const buffer = fs.readFileSync(archivePath);
      const unpackResult = unpackArchive(buffer, tmpDir);
      expect(unpackResult.manifest.name).toBe("collections-extra");
      expect(unpackResult.manifest.version).toBe("1.1.0");
      expect(unpackResult.manifest.edition).toBe("2027");
      expect(unpackResult.files).toContain("src/main.hkd");
      expect(unpackResult.checksum).toMatch(/^(sha256:)?[a-f0-9]{64}$/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("PKG-11-03: Package main script executes cleanly", () => {
    const mainPath = path.join(pkgDir, "src/main.hkd");
    let out = "";
    const res = runFile(mainPath, {
      noExit: true,
      output: s => { out += s + "\n"; },
    });
    expect(res.ok).toBe(true);
    expect(out).toContain("=== collections-extra v1.1.0 Self-Test ===");
    expect(out).toContain("Unique: [1, 2, 3, -4, 5, 6, 7]");
    expect(out).toContain("Chunked: [[1, 2], [3, 4], [5]]");
    expect(out).toContain("Partitioned: [[1, 2], [-2, -1, 0]]");
    expect(out).toContain("Zipped: [[10, \"A\"], [20, \"B\"], [30, \"C\"]]");
    expect(out).toContain("=== All collections-extra tests passed ===");
  });
});
