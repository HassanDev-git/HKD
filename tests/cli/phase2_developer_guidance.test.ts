/**
 * HKD Phase 2: Compiler Diagnostics & Developer Guidance Tests
 *
 * Verifies:
 * 1. First-class edition selection for `hkd init` (--edition 2026/2027, rejection of invalid editions)
 * 2. First-class edition selection for `hkd repl` (--edition 2026/2027, rejection of invalid editions)
 * 3. E303 Type Mismatch diagnostics (structural diffs, generic diffs, array/fn diffs)
 * 4. E301 Undefined Identifier diagnostics with standard library suggestions & ambiguity protection
 * 5. `hkd explain` CLI ergonomics and documentation
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";
import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { SemanticAnalyser } from "../../src/semantic/analyser.js";
import { ErrorReporter, ErrorCode } from "../../src/errors/index.js";
import { explainError } from "../../src/cli/explain.js";
import { parseEdition } from "../../src/utils/edition.js";

const cliPath = path.resolve(__dirname, "../../dist/cli/main.js");

function checkSemantics(src: string, edition: "2026" | "2027" = "2026") {
  const reporter = new ErrorReporter(src, "test_check.hkd");
  const lexer = new Lexer(src, "test_check.hkd", reporter);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, src, "test_check.hkd", reporter, edition);
  const ast = parser.parse();
  const analyser = new SemanticAnalyser(reporter, src);
  analyser.analyse(ast);
  return {
    reporter,
    hasErrors: reporter.hasErrors(),
    errors: reporter.getErrors(),
    warnings: reporter.getWarnings(),
    formatted: reporter.format(),
  };
}

describe("HKD Phase 2 — Developer Guidance & Compiler Diagnostics", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-phase2-"));
  });

  afterEach(() => {
    if (fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  // ── 1. First-Class Edition Selection for `hkd init` ────────────────────────

  describe("hkd init --edition", () => {
    test("default init produces edition = '2026' in hkd.toml", () => {
      const projDir = path.join(tmpRoot, "app-default");
      const res = spawnSync(
        process.execPath,
        [cliPath, "init", projDir, "app-default"],
        { cwd: tmpRoot, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
      );
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Edition: 2026");

      const toml = fs.readFileSync(path.join(projDir, "hkd.toml"), "utf-8");
      expect(toml).toContain('edition = "2026"');

      // Passes test runner
      const testRes = spawnSync(
        process.execPath,
        [cliPath, "test"],
        { cwd: projDir, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
      );
      expect(testRes.status).toBe(0);
      expect(testRes.stdout).toContain("1 passed");
    });

    test("explicit --edition 2026 produces edition = '2026' and clean test pass", () => {
      const projDir = path.join(tmpRoot, "app-2026");
      const res = spawnSync(
        process.execPath,
        [cliPath, "init", projDir, "app-2026", "--edition", "2026"],
        { cwd: tmpRoot, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
      );
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Edition: 2026");

      const toml = fs.readFileSync(path.join(projDir, "hkd.toml"), "utf-8");
      expect(toml).toContain('edition = "2026"');

      const testRes = spawnSync(
        process.execPath,
        [cliPath, "test"],
        { cwd: projDir, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
      );
      expect(testRes.status).toBe(0);
      expect(testRes.stdout).toContain("1 passed");
    });

    test("explicit --edition 2027 scaffolds 2027 patterns and passes hkd test", () => {
      const projDir = path.join(tmpRoot, "app-2027");
      const res = spawnSync(
        process.execPath,
        [cliPath, "init", projDir, "app-2027", "--edition", "2027"],
        { cwd: tmpRoot, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
      );
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Edition: 2027");

      const toml = fs.readFileSync(path.join(projDir, "hkd.toml"), "utf-8");
      expect(toml).toContain('edition = "2027"');

      // The 2027 template contains match
      const mainHkd = fs.readFileSync(path.join(projDir, "src", "main.hkd"), "utf-8");
      expect(mainHkd).toContain("match");

      const testRes = spawnSync(
        process.execPath,
        [cliPath, "test"],
        { cwd: projDir, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
      );
      expect(testRes.status).toBe(0);
      expect(testRes.stdout).toContain("basic match works");
      expect(testRes.stdout).toContain("1 passed");
    });

    test("library template with --edition 2027 scaffolds generic functions and passes test", () => {
      const projDir = path.join(tmpRoot, "lib-2027");
      const res = spawnSync(
        process.execPath,
        [cliPath, "init", projDir, "lib-2027", "--template", "lib", "--edition", "2027"],
        { cwd: tmpRoot, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
      );
      expect(res.status).toBe(0);

      const mainHkd = fs.readFileSync(path.join(projDir, "src", "main.hkd"), "utf-8");
      expect(mainHkd).toContain("identity<T>");

      const testRes = spawnSync(
        process.execPath,
        [cliPath, "test"],
        { cwd: projDir, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
      );
      expect(testRes.status).toBe(0);
      expect(testRes.stdout).toContain("generics work");
    });

    test("unsupported edition (e.g. 2025) is cleanly rejected with diagnostic exit code 2", () => {
      const projDir = path.join(tmpRoot, "app-invalid");
      const res = spawnSync(
        process.execPath,
        [cliPath, "init", projDir, "app-invalid", "--edition", "2025"],
        { cwd: tmpRoot, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
      );
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("Unsupported edition '2025'");
      expect(res.stderr).toContain('"2026", "2027"');
    });

    test("hkd init --help displays usage and edition option", () => {
      const res = spawnSync(
        process.execPath,
        [cliPath, "init", "--help"],
        { cwd: tmpRoot, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
      );
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("HKD Project Initializer");
      expect(res.stdout).toContain("--edition <2026|2027>");
    });
  });

  // ── 2. First-Class Edition Selection for `hkd repl` ────────────────────────

  describe("hkd repl --edition", () => {
    test("hkd repl --help displays usage and edition option", () => {
      const res = spawnSync(
        process.execPath,
        [cliPath, "repl", "--help"],
        { cwd: tmpRoot, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
      );
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("HKD Interactive REPL");
      expect(res.stdout).toContain("--edition <2026|2027>");
    });

    test("hkd repl rejects unsupported edition with clean diagnostic", () => {
      const res = spawnSync(
        process.execPath,
        [cliPath, "repl", "--edition", "2020"],
        { cwd: tmpRoot, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
      );
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("Unsupported edition '2020'");
    });

    test("parseEdition utility parses valid editions and throws on invalid", () => {
      expect(parseEdition(undefined)).toBe("2026");
      expect(parseEdition("")).toBe("2026");
      expect(parseEdition("2026")).toBe("2026");
      expect(parseEdition("2027")).toBe("2027");
      expect(() => parseEdition("2030")).toThrow("Unsupported edition '2030'");
    });
  });

  // ── 3. E303 Type Mismatch Diagnostics ──────────────────────────────────────

  describe("E303 Type Mismatch Diagnostics", () => {
    test("primitive type mismatch includes expected, found, and span label", () => {
      const src = `let x: Int = "hello"`;
      const res = checkSemantics(src);
      expect(res.hasErrors).toBe(true);
      const err = res.errors.find((e) => e.code === ErrorCode.E303);
      expect(err).toBeDefined();
      expect(err!.message).toContain("Cannot assign `String` to `Int`");
      expect(err!.label).toBe("expected `Int`, found `String`");
      expect(res.formatted).toContain("expected `Int`, found `String`");
    });

    test("return type mismatch contains expected and found types", () => {
      const src = `
        fn compute() -> Int {
            return "not an int"
        }
      `;
      const res = checkSemantics(src);
      expect(res.hasErrors).toBe(true);
      const err = res.errors.find((e) => e.code === ErrorCode.E303);
      expect(err).toBeDefined();
      expect(err!.message).toContain("Return type mismatch: expected `Int`, got `String`");
      expect(err!.label).toBe("expected `Int`, found `String`");
    });

    test("if condition type mismatch contains expected Bool", () => {
      const src = `
        if 42 {
            let y = 1
        }
      `;
      const res = checkSemantics(src);
      expect(res.hasErrors).toBe(true);
      const err = res.errors.find((e) => e.code === ErrorCode.E303);
      expect(err).toBeDefined();
      expect(err!.message).toContain("Condition must be `Bool`, found `Int`");
      expect(err!.label).toBe("expected `Bool`, found `Int`");
    });

    test("structural diff for struct type mismatch detects missing and mismatched fields", () => {
      const src = `
        struct ExpectedUser {
            id: Int
            name: String
            active: Bool
        }
        struct GivenUser {
            id: Int
            name: Int
        }
        fn process(u: ExpectedUser) -> Int { return u.id; }
        fn test() {
            let g = GivenUser { id: 1, name: 2 }
            let x: ExpectedUser = g
        }
      `;
      const res = checkSemantics(src);
      expect(res.hasErrors).toBe(true);
      const err = res.errors.find((e) => e.code === ErrorCode.E303);
      expect(err).toBeDefined();
      expect(err!.notes).toBeDefined();
      expect(err!.notes!.some((n) => n.includes("missing in struct `GivenUser`"))).toBe(true);
      expect(err!.notes!.some((n) => n.includes("field `name` type mismatch"))).toBe(true);
    });

    test("structural diff for array element type mismatch", () => {
      const src = `
        let arr: [Int] = ["one", "two"]
      `;
      const res = checkSemantics(src);
      expect(res.hasErrors).toBe(true);
      const err = res.errors.find((e) => e.code === ErrorCode.E303);
      expect(err).toBeDefined();
      expect(err!.notes).toBeDefined();
      expect(err!.notes!.some((n) => n.includes("array element type mismatch"))).toBe(true);
    });

    test("structural diff for function type mismatch (parameter mismatch)", () => {
      const src = `
        let f: fn(Int) -> Int = fn(x: String) -> Int { return 1; }
      `;
      const res = checkSemantics(src);
      expect(res.hasErrors).toBe(true);
      const err = res.errors.find((e) => e.code === ErrorCode.E303);
      expect(err).toBeDefined();
      expect(err!.notes).toBeDefined();
      expect(err!.notes!.some((n) => n.includes("parameter 1 type mismatch"))).toBe(true);
    });
  });

  // ── 4. E301 Standard Library Suggestions ───────────────────────────────────

  describe("E301 Standard Library Import Suggestions", () => {
    test("unimported unique symbol suggests module import (math.sqrt)", () => {
      const src = `let x = sqrt(16)`;
      const res = checkSemantics(src);
      expect(res.hasErrors).toBe(true);
      const err = res.errors.find((e) => e.code === ErrorCode.E301);
      expect(err).toBeDefined();
      expect(err!.help).toBeDefined();
      expect(err!.help![0]).toContain("`sqrt` is available from the `math` standard library module");
      expect(err!.help![1]).toContain("import math");
    });

    test("unimported unique symbol suggests fs module import (read_file)", () => {
      const src = `let content = read_file("test.txt")`;
      const res = checkSemantics(src);
      expect(res.hasErrors).toBe(true);
      const err = res.errors.find((e) => e.code === ErrorCode.E301);
      expect(err).toBeDefined();
      expect(err!.help![0]).toContain("`read_file` is available from the `fs` standard library module");
      expect(err!.help![1]).toContain("import fs");
    });

    test("unimported unique symbol suggests json module import (stringify)", () => {
      const src = `let jsonStr = stringify({ id: 1 })`;
      const res = checkSemantics(src);
      expect(res.hasErrors).toBe(true);
      const err = res.errors.find((e) => e.code === ErrorCode.E301);
      expect(err).toBeDefined();
      expect(err!.help![0]).toContain("`stringify` is available from the `json` standard library module");
      expect(err!.help![1]).toContain("import json");
    });

    test("already-imported module suggests member access (math.sqrt instead of import math)", () => {
      const src = `
        import math
        let x = sqrt(16)
      `;
      const res = checkSemantics(src);
      expect(res.hasErrors).toBe(true);
      const err = res.errors.find((e) => e.code === ErrorCode.E301);
      expect(err).toBeDefined();
      expect(err!.help![0]).toContain("`sqrt` is exported by module `math`. Use `math.sqrt` to access it.");
      expect(err!.help!.some((h) => h.includes("add: import"))).toBe(false);
    });

    test("ambiguous standard library symbol (e.g. join) does NOT suggest single module", () => {
      const src = `let res = join(["a", "b"])`;
      const res = checkSemantics(src);
      expect(res.hasErrors).toBe(true);
      const err = res.errors.find((e) => e.code === ErrorCode.E301);
      expect(err).toBeDefined();
      // Ambiguous symbols do not produce a misleading "available from X" help
      const hasSpecificImportHelp = err!.help?.some((h) => h.includes("available from the"));
      expect(hasSpecificImportHelp).toBeFalsy();
    });

    test("non-stdlib undefined variable offers typo suggestion if close match exists", () => {
      const src = `
        let counter = 10
        let next = countr + 1
      `;
      const res = checkSemantics(src);
      expect(res.hasErrors).toBe(true);
      const err = res.errors.find((e) => e.code === ErrorCode.E301);
      expect(err).toBeDefined();
      expect(err!.help![0]).toContain("Did you mean `counter`?");
    });

    test("properly qualified stdlib usage produces zero semantic errors", () => {
      const src = `
        import math
        import fs
        let val = math.sqrt(25)
      `;
      const res = checkSemantics(src);
      expect(res.hasErrors).toBe(false);
    });
  });

  // ── 5. hkd explain Polish & Ergonomics ─────────────────────────────────────

  describe("hkd explain CLI", () => {
    test("hkd explain --help prints explanation help", () => {
      const res = spawnSync(
        process.execPath,
        [cliPath, "explain", "--help"],
        { cwd: tmpRoot, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
      );
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("HKD Error Explanation Tool");
      expect(res.stdout).toContain("hkd explain <error_code>");
    });

    test("hkd explain E301 provides updated stdlib guidance", () => {
      const explanation = explainError("E301");
      expect(explanation).toContain("[E301]");
      expect(explanation).toContain("standard library");
      expect(explanation).toContain("import math");
    });

    test("hkd explain E303 provides updated structural type guidance", () => {
      const explanation = explainError("E303");
      expect(explanation).toContain("[E303]");
      expect(explanation).toContain("structs");
      expect(explanation).toContain("arrays");
      expect(explanation).toContain("functions");
      expect(explanation).toContain("generic");
    });

    test("hkd explain unknown code provides informative list of available codes", () => {
      const explanation = explainError("E999");
      expect(explanation).toContain("Error code `E999` not found");
      expect(explanation).toContain("Available codes:");
      expect(explanation).toContain("E101");
      expect(explanation).toContain("E303");
    });
  });
});
