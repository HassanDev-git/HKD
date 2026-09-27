/**
 * HKD 1.0 Project Migration Engine Tests (tests/tooling/migrate.test.ts)
 *
 * Validates automated migration of legacy manifests and lockfiles to Edition 2026.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { runMigration } from "../../src/tooling/migrate.js";

describe("HKD 1.0 Migration Engine (hkd migrate)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-migrate-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("returns failure if hkd.toml is missing", () => {
    const res = runMigration(tmpDir, false);
    expect(res.ok).toBe(false);
    expect(res.warnings[0]).toContain("No hkd.toml found");
  });

  test("migrates manifest without edition to Edition 2026", () => {
    const tomlContent = `[package]\nname = "legacy-app"\nversion = "0.1.0"\n`;
    const tomlPath = path.join(tmpDir, "hkd.toml");
    fs.writeFileSync(tomlPath, tomlContent, "utf-8");

    const res = runMigration(tmpDir, false);
    expect(res.ok).toBe(true);
    expect(res.changes).toContain("Upgraded project manifest to Edition 2026");

    const updated = fs.readFileSync(tomlPath, "utf-8");
    expect(updated).toContain('edition = "2026"');
    expect(fs.existsSync(`${tomlPath}.bak`)).toBe(true);
  });

  test("dry-run does not write changes or backup files", () => {
    const tomlContent = `[package]\nname = "dry-app"\nversion = "0.5.0"\n`;
    const tomlPath = path.join(tmpDir, "hkd.toml");
    fs.writeFileSync(tomlPath, tomlContent, "utf-8");

    const res = runMigration(tmpDir, true);
    expect(res.ok).toBe(true);
    expect(res.changes).toContain("Upgraded project manifest to Edition 2026");

    const current = fs.readFileSync(tomlPath, "utf-8");
    expect(current).toBe(tomlContent);
    expect(fs.existsSync(`${tomlPath}.bak`)).toBe(false);
  });

  test("replaces existing older edition with 2026", () => {
    const tomlContent = `[package]\nname = "older-app"\nedition = "2024"\nversion = "0.8.0"\n`;
    const tomlPath = path.join(tmpDir, "hkd.toml");
    fs.writeFileSync(tomlPath, tomlContent, "utf-8");

    const res = runMigration(tmpDir, false);
    expect(res.ok).toBe(true);

    const updated = fs.readFileSync(tomlPath, "utf-8");
    expect(updated).toContain('edition = "2026"');
    expect(updated).not.toContain('edition = "2024"');
  });

  test("already conformant project reports no changes needed", () => {
    const tomlContent = `[package]\nname = "modern-app"\nedition = "2026"\nversion = "1.0.0"\n`;
    const tomlPath = path.join(tmpDir, "hkd.toml");
    fs.writeFileSync(tomlPath, tomlContent, "utf-8");

    const res = runMigration(tmpDir, false);
    expect(res.ok).toBe(true);
    expect(res.changes[0]).toContain("already fully conformant");
  });
});
