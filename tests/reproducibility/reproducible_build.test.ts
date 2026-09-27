import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { SemanticAnalyser } from "../../src/semantic/analyser.js";
import { Compiler } from "../../src/bytecode/compiler.js";
import { ErrorReporter } from "../../src/errors/index.js";
import { serializeProgram } from "../../src/bytecode/serializer.js";
import { packArchive, unpackArchive } from "../../src/package-manager/archive.js";
import { serializeLockfileV2, parseLockfileV2, LockfileV2 } from "../../src/package-manager/lockfile.js";

describe("Workstream 8F: Reproducible Builds & Determinism Verification", () => {
  const testDir = path.resolve(".hkd/test_reproducibility_" + Date.now());

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  function compileSourceToBytecode(source: string, edition: "2026" | "2027" = "2026"): Buffer {
    const reporter = new ErrorReporter(source, "<test>");
    const lexer = new Lexer(source, "<test>", reporter);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, source, "<test>", reporter);
    const ast = parser.parse();
    const analyser = new SemanticAnalyser(reporter, source);
    analyser.analyse(ast);
    const compiler = new Compiler(reporter);
    const chunk = compiler.compile(ast);
    return serializeProgram(chunk);
  }

  test("1. Bytecode serialization determinism across multiple independent runs", () => {
    const sourceCode = `
      fn fib(n: int) -> int {
        if n <= 1 {
          return n;
        }
        return fib(n - 1) + fib(n - 2);
      }

      let x: int = 10;
      let res: int = fib(x);
      let s: string = "hello world";
      let b: bool = true;
    `;

    const runs = 5;
    const hashes: string[] = [];

    for (let i = 0; i < runs; i++) {
      const buf = compileSourceToBytecode(sourceCode, "2026");
      const hash = crypto.createHash("sha256").update(buf).digest("hex");
      hashes.push(hash);
    }

    // All hashes must be identical
    for (let i = 1; i < runs; i++) {
      expect(hashes[i]).toBe(hashes[0]);
    }
  });

  test("2. Bytecode determinism for complex closures, loops, and async constructs", () => {
    const sourceCode = `
      async fn calculate(step: int) -> int {
        let total = 0;
        for i in 0..10 {
          total = total + i * step;
        }
        return total;
      }
    `;

    const buf1 = compileSourceToBytecode(sourceCode, "2027");
    const buf2 = compileSourceToBytecode(sourceCode, "2027");

    const hash1 = crypto.createHash("sha256").update(buf1).digest("hex");
    const hash2 = crypto.createHash("sha256").update(buf2).digest("hex");

    expect(hash1).toBe(hash2);
    expect(buf1.equals(buf2)).toBe(true);
  });

  test("3. Deterministic .hkdpack archive generation across independent packings", () => {
    const pkgDir = path.join(testDir, "sample_pkg");
    fs.mkdirSync(path.join(pkgDir, "src"), { recursive: true });

    fs.writeFileSync(path.join(pkgDir, "hkd.toml"), `
[package]
name = "math-utils"
version = "1.0.0"
authors = ["HKD Team <team@hkd.dev>"]
edition = "2026"
    `.trim());

    fs.writeFileSync(path.join(pkgDir, "src", "index.hkd"), `
      fn add(a: int, b: int) -> int {
        return a + b;
      }
    `.trim());

    fs.writeFileSync(path.join(pkgDir, "src", "sub.hkd"), `
      fn sub(a: int, b: int) -> int {
        return a - b;
      }
    `.trim());

    const manifest = {
      name: "math-utils",
      version: "1.0.0",
      author: "HKD Team <team@hkd.dev>",
      edition: "2026" as const,
      main: "src/index.hkd",
      dependencies: {},
      devDependencies: {},
    };

    const pack1 = packArchive(pkgDir, manifest);
    const pack2 = packArchive(pkgDir, manifest);

    expect(pack1.checksum).toBe(pack2.checksum);
    expect(pack1.buffer.equals(pack2.buffer)).toBe(true);
    expect(pack1.fileCount).toBe(pack2.fileCount);

    // Unpack and verify integrity check passes
    const unpackDest = path.join(testDir, "unpacked_sample");
    const unpackRes = unpackArchive(pack1.buffer, unpackDest, pack1.checksum);
    expect(unpackRes.checksum).toBe(pack1.checksum);
    expect(unpackRes.files.length).toBeGreaterThan(0);
  });

  test("4. Deterministic lockfile V2 serialization regardless of package insertion order", () => {
    const lockfileA: LockfileV2 = {
      version: 2,
      resolver: "2.0",
      packages: [
        {
          name: "zeta-lib",
          version: "1.0.0",
          source: "registry",
          checksum: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          dependencies: ["alpha-core 1.0.0", "beta-utils 2.0.0"],
        },
        {
          name: "alpha-core",
          version: "1.0.0",
          source: "registry",
          checksum: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
          dependencies: [],
        },
        {
          name: "beta-utils",
          version: "2.0.0",
          source: "registry",
          checksum: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
          dependencies: ["alpha-core 1.0.0"],
        },
      ],
    };

    const lockfileB: LockfileV2 = {
      version: 2,
      resolver: "2.0",
      packages: [
        {
          name: "beta-utils",
          version: "2.0.0",
          source: "registry",
          checksum: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
          dependencies: ["alpha-core 1.0.0"],
        },
        {
          name: "zeta-lib",
          version: "1.0.0",
          source: "registry",
          checksum: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          // reversed order in dependencies list:
          dependencies: ["beta-utils 2.0.0", "alpha-core 1.0.0"],
        },
        {
          name: "alpha-core",
          version: "1.0.0",
          source: "registry",
          checksum: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
          dependencies: [],
        },
      ],
    };

    const serializedA = serializeLockfileV2(lockfileA);
    const serializedB = serializeLockfileV2(lockfileB);

    expect(serializedA).toBe(serializedB);

    const hashA = crypto.createHash("sha256").update(serializedA).digest("hex");
    const hashB = crypto.createHash("sha256").update(serializedB).digest("hex");
    expect(hashA).toBe(hashB);

    // Parsing serialized output produces equivalent object
    const parsedA = parseLockfileV2(serializedA);
    const parsedB = parseLockfileV2(serializedB);
    expect(parsedA).toEqual(parsedB);
  });
});
