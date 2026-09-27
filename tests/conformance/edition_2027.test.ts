/**
 * HKD 1.1 Conformance Suite: Edition 2027 Specification
 * (tests/conformance/edition_2027.test.ts)
 *
 * Validates the Edition 2027 environment, default enablement of RFC features,
 * strict backward compatibility for Edition 2026, and project-level edition configuration.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { runSource } from "../../src/runtime/index.js";
import { runMigration } from "../../src/tooling/migrate.js";

describe("HKD 1.1 Conformance — Edition 2027 System", () => {
  test("ED-01: Edition 2027 enables generics and pattern matching seamlessly", () => {
    const src = `
      fn process_item<T>(item: T) -> String {
        return match item {
          1 => "integer one",
          "hkd" => "language hkd",
          _ => "other generic item"
        };
      }
      print(process_item(1));
      print(process_item("hkd"));
      print(process_item(true));
    `;
    let out = "";
    const res = runSource(src, {
      edition: "2027",
      noExit: true,
      output: s => { out += s + "\n"; },
    });
    expect(res.ok).toBe(true);
    expect(out.trim()).toBe("integer one\nlanguage hkd\nother generic item");
  });

  test("ED-02: Edition 2026 strictly preserves 1.0 behavior without #feature", () => {
    const genericSrc = `fn foo<T>(x: T) -> T { return x; }`;
    const resGen = runSource(genericSrc, { edition: "2026", noExit: true });
    expect(resGen.ok).toBe(false);
    expect(resGen.diagnostics.some(d => d.includes("generics") || d.includes("E201"))).toBe(true);

    const matchSrc = `let res = match 1 { 1 => "one", _ => "other" };`;
    const resMatch = runSource(matchSrc, { edition: "2026", noExit: true });
    expect(resMatch.ok).toBe(false);
    expect(resMatch.diagnostics.some(d => d.includes("pattern_matching") || d.includes("E204") || d.includes("E201"))).toBe(true);
  });

  test("ED-03: Edition 2026 with explicit #feature flags enables targeted features", () => {
    const src = `
      #feature(pattern_matching)
      #feature(generics)

      fn identity<T>(x: T) -> T {
        return x;
      }

      let choice = match 42 {
        42 => identity("matched forty-two"),
        _ => "miss"
      };
      print(choice);
    `;
    let out = "";
    const res = runSource(src, {
      edition: "2026",
      noExit: true,
      output: s => { out += s + "\n"; },
    });
    expect(res.ok).toBe(true);
    expect(out.trim()).toBe("matched forty-two");
  });

  test("ED-04: Project migration to edition 2027 updates hkd.toml", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-migrate-test-"));
    try {
      const manifestPath = path.join(tmpDir, "hkd.toml");
      fs.writeFileSync(
        manifestPath,
        `[package]
name = "my_app"
version = "1.0.0"
edition = "2026"
`
      );

      const result = runMigration(tmpDir, false, "2027");
      expect(result.ok).toBe(true);

      const updated = fs.readFileSync(manifestPath, "utf-8");
      expect(updated).toContain('edition = "2027"');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
