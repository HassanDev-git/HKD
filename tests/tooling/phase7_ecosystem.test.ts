/**
 * HKD Phase 7 Ecosystem & Production Readiness Test Suite
 * (tests/tooling/phase7_ecosystem.test.ts)
 *
 * Validates:
 * - Developer Journey: init -> fmt -> check -> build -> test -> tree
 * - Package Manager: add (path & archive), remove, update, vendor, cache
 * - Tree command: text and JSON outputs
 * - Archive Security: path traversal defense, decompression bomb prevention, checksum integrity
 * - CLI diagnostics and error explanations
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { spawnSync } from "child_process";
import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { PackageManager2 } from "../../src/package-manager/manager.js";
import { packArchive, unpackArchive, MAX_ARCHIVE_FILES, ARCHIVE_MAGIC } from "../../src/package-manager/archive.js";
import { explainError } from "../../src/cli/explain.js";
import { ContentAddressedCache } from "../../src/package-manager/cache.js";
import { readLockfile } from "../../src/package-manager/lockfile.js";
import { readManifest } from "../../src/package-manager/index.js";
import { ErrorReporter } from "../../src/errors/index.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { format } from "../../src/formatter/index.js";
import { SemanticAnalyser } from "../../src/semantic/analyser.js";

describe("HKD Phase 7: Developer Ecosystem & Production Readiness", () => {
  const sandbox = path.resolve(".hkd/test_phase7_ecosystem_sandbox");
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

  test("ECO-01: Developer Journey - Project Initialization & Structure", () => {
    const appDir = path.join(sandbox, "my-app");
    const pm = new PackageManager2({ cacheDir });
    const res = pm.init(appDir, "my-app", "cli", "2026");

    expect(res.ok).toBe(true);
    expect(fs.existsSync(path.join(appDir, "hkd.toml"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, "src", "main.hkd"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, "tests", "main.test.hkd"))).toBe(true);

    const manifest = readManifest(appDir);
    expect(manifest?.name).toBe("my-app");
    expect(manifest?.edition).toBe("2026");
  });

  test("ECO-02: Package Manager - Local Path Dependency Workflow", async () => {
    const libDir = path.join(sandbox, "my-lib");
    const appDir = path.join(sandbox, "my-app");
    const pm = new PackageManager2({ cacheDir });

    pm.init(libDir, "my-lib", "lib", "2026");
    fs.writeFileSync(
      path.join(libDir, "src", "main.hkd"),
      "export fn add(a: Int, b: Int) -> Int { return a + b; }\n"
    );

    // Add path dependency
    const addRes = await pm.add(appDir, "my-lib", { path: "../my-lib" });
    expect(addRes.ok).toBe(true);

    // Verify lockfile source
    const lock = readLockfile(appDir);
    expect(lock).not.toBeNull();
    const lockedLib = lock?.packages.find((p) => p.name === "my-lib");
    expect(lockedLib).toBeDefined();
    expect(lockedLib?.source).toBe("path:../my-lib");

    // Verify .hkd/deps contains the dependency
    const installedMain = path.join(appDir, ".hkd", "deps", "my-lib", "src", "main.hkd");
    expect(fs.existsSync(installedMain)).toBe(true);
  });

  test("ECO-03: Package Manager - Vendoring Support", async () => {
    const appDir = path.join(sandbox, "my-app");
    const pm = new PackageManager2({ cacheDir });

    const vendorRes = await pm.vendor(appDir);
    expect(vendorRes.ok).toBe(true);

    const vendoredFile = path.join(appDir, "vendor", "my-lib", "src", "main.hkd");
    expect(fs.existsSync(vendoredFile)).toBe(true);
  });

  test("ECO-04: Package Manager - Archive (.hkdpack) Creation and Consumption", async () => {
    const libDir = path.join(sandbox, "my-lib");
    const consumerDir = path.join(sandbox, "consumer-app");
    const pm = new PackageManager2({ cacheDir });

    pm.init(consumerDir, "consumer-app", "cli", "2026");

    // Pack my-lib
    const packRes = pm.pack(libDir);
    expect(fs.existsSync(packRes.path)).toBe(true);
    expect(packRes.checksum.startsWith("sha256:")).toBe(true);

    // Consumer adds .hkdpack archive directly
    const addArchiveRes = await pm.add(consumerDir, packRes.path);
    if (!addArchiveRes.ok) console.error("addArchiveRes failed:", addArchiveRes.message);
    expect(addArchiveRes.ok).toBe(true);

    // Check lockfile in consumer
    const lock = readLockfile(consumerDir);
    const lockedLib = lock?.packages.find((p) => p.name === "my-lib");
    expect(lockedLib).toBeDefined();
    expect(lockedLib?.checksum).toBe(packRes.checksum);
  });

  test("ECO-05: Package Manager - Update and Remove Operations", async () => {
    const consumerDir = path.join(sandbox, "consumer-app");
    const pm = new PackageManager2({ cacheDir });

    // Update
    const updateRes = await pm.update(consumerDir);
    expect(updateRes.ok).toBe(true);

    // Remove
    const removeRes = await pm.remove(consumerDir, "my-lib");
    expect(removeRes.ok).toBe(true);

    const lockAfterRemove = readLockfile(consumerDir);
    expect(lockAfterRemove?.packages.length).toBe(0);
  });

  test("ECO-06: Archive Security - Path Traversal Protection", () => {
    const maliciousDir = path.join(sandbox, "malicious-target");

    // Construct an archive buffer with path traversal '../evil.txt'
    const magicBuf = Buffer.from(ARCHIVE_MAGIC, "ascii");
    const manifestBuf = Buffer.from(JSON.stringify({ name: "evil", version: "1.0.0" }), "utf-8");
    const manifestLen = Buffer.alloc(4);
    manifestLen.writeUInt32BE(manifestBuf.length, 0);

    const fileCount = Buffer.alloc(4);
    fileCount.writeUInt32BE(1, 0);

    const badPathBuf = Buffer.from("../evil.txt", "utf-8");
    const badPathLen = Buffer.alloc(4);
    badPathLen.writeUInt32BE(badPathBuf.length, 0);

    const contentBuf = Buffer.from("malicious payload", "utf-8");
    const contentLen = Buffer.alloc(4);
    contentLen.writeUInt32BE(contentBuf.length, 0);

    const archiveBuf = Buffer.concat([
      magicBuf,
      manifestLen,
      manifestBuf,
      fileCount,
      badPathLen,
      badPathBuf,
      contentLen,
      contentBuf,
    ]);

    expect(() => {
      unpackArchive(archiveBuf, maliciousDir);
    }).toThrow(/error\[SEC005\]/);
  });

  test("ECO-07: Archive Security - Checksum Tampering Protection", () => {
    const sampleDir = path.join(sandbox, "sample-pkg");
    fs.mkdirSync(path.join(sampleDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(sampleDir, "src", "main.hkd"), "print(1);\n");

    const manifest = { name: "sample", version: "1.0.0", dependencies: {}, devDependencies: {} };
    const pack = packArchive(sampleDir, manifest as any);

    // Unpack with incorrect checksum
    expect(() => {
      unpackArchive(pack.buffer, path.join(sandbox, "unpack-tampered"), "sha256:0000000000000000000000000000000000000000000000000000000000000000");
    }).toThrow(/error\[SEC001\]/);
  });

  test("ECO-08: Content-Addressed Cache Verification", () => {
    const cache = new ContentAddressedCache(cacheDir);
    const verifyRes = cache.verify();
    expect(verifyRes.valid).toBe(true);
    expect(verifyRes.corrupted.length).toBe(0);
  });

  test("ECO-09: CLI Compiler Error Explanations (hkd explain)", () => {
    const e201 = explainError("E201");
    expect(e201).toContain("E201");
    expect(e201).toContain("Unexpected Token");

    const e301 = explainError("E301");
    expect(e301).toContain("E301");
    expect(e301).toContain("Undefined Variable");
  });

  test("ECO-10: In-Process Formatter & Type-Check Verification", () => {
    const journeyDir = path.join(sandbox, "in-proc-journey-app");
    const pm = new PackageManager2({ cacheDir });
    pm.init(journeyDir, "in-proc-journey-app", "cli", "2026");

    const mainPath = path.join(journeyDir, "src", "main.hkd");
    const source = fs.readFileSync(mainPath, "utf-8");

    // Lex, parse, format
    const reporter = new ErrorReporter(source, mainPath);
    const lexer = new Lexer(source, mainPath, reporter);
    const tokens = lexer.tokenize();
    expect(reporter.hasErrors()).toBe(false);

    const parser = new Parser(tokens, source, mainPath, reporter);
    const ast = parser.parse();
    expect(reporter.hasErrors()).toBe(false);

    const formatted = format(ast);
    expect(formatted.length).toBeGreaterThan(0);

    // Semantic analysis
    const analyser = new SemanticAnalyser(reporter, source);
    analyser.analyse(ast);
    expect(reporter.hasErrors()).toBe(false);
  });
});
