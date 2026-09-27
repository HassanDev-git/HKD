/**
 * HKD Reproducible Build Verification Script
 *
 * Runs clean dual-build verification on sample HKD source code and archives,
 * printing cryptographic hashes and asserting bit-for-bit equivalence.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { Lexer } from "../dist/lexer/lexer.js";
import { Parser } from "../dist/parser/parser.js";
import { SemanticAnalyser } from "../dist/semantic/analyser.js";
import { Compiler } from "../dist/bytecode/compiler.js";
import { ErrorReporter } from "../dist/errors/index.js";
import { serializeProgram } from "../dist/bytecode/serializer.js";
import { packArchive } from "../dist/package-manager/archive.js";

function compile(source) {
  const reporter = new ErrorReporter(source, "<repro-test>");
  const lexer = new Lexer(source, "<repro-test>", reporter);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, source, "<repro-test>", reporter);
  const ast = parser.parse();
  const analyser = new SemanticAnalyser(reporter, source);
  analyser.analyse(ast);
  const compiler = new Compiler(reporter);
  const chunk = compiler.compile(ast);
  return serializeProgram(chunk);
}

function runReproducibleBuildVerification() {
  console.log("==================================================");
  console.log("  HKD REPRODUCIBLE BUILD VERIFICATION SUITE");
  console.log("==================================================");

  const sampleSource = `
    fn compute(x: int, y: int) -> int {
      let mut sum = 0;
      for i in 0..x {
        sum = sum + i * y;
      }
      return sum;
    }

    let result = compute(10, 5);
  `;

  console.log("\n[1/3] Testing Bytecode Determinism (3 independent passes)...");
  const pass1 = compile(sampleSource);
  const pass2 = compile(sampleSource);
  const pass3 = compile(sampleSource);

  const h1 = crypto.createHash("sha256").update(pass1).digest("hex");
  const h2 = crypto.createHash("sha256").update(pass2).digest("hex");
  const h3 = crypto.createHash("sha256").update(pass3).digest("hex");

  console.log(`  Pass 1 SHA-256: ${h1}`);
  console.log(`  Pass 2 SHA-256: ${h2}`);
  console.log(`  Pass 3 SHA-256: ${h3}`);

  if (h1 !== h2 || h2 !== h3) {
    console.error("FAIL: Non-deterministic bytecode detected!");
    process.exit(1);
  }
  console.log("  PASS: Bytecode compilation is bit-for-bit identical.");

  console.log("\n[2/3] Testing .hkdpack Archive Determinism...");
  const tempDir = path.resolve(".hkd/repro_script_temp_" + Date.now());
  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "main.hkd"), sampleSource);
  fs.writeFileSync(path.join(tempDir, "hkd.toml"), `
[package]
name = "repro-test"
version = "1.0.0"
edition = "2026"
  `.trim());

  const manifest = {
    name: "repro-test",
    version: "1.0.0",
    edition: "2026",
    main: "src/main.hkd",
  };

  const pack1 = packArchive(tempDir, manifest);
  const pack2 = packArchive(tempDir, manifest);

  console.log(`  Pack 1 Checksum: ${pack1.checksum} (${pack1.buffer.length} bytes)`);
  console.log(`  Pack 2 Checksum: ${pack2.checksum} (${pack2.buffer.length} bytes)`);

  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}

  if (pack1.checksum !== pack2.checksum) {
    console.error("FAIL: Non-deterministic .hkdpack detected!");
    process.exit(1);
  }
  console.log("  PASS: Package archive creation is bit-for-bit identical.");

  console.log("\n[3/3] Verification Summary:");
  console.log("  All reproducibility checks PASSED (100% bit-for-bit equivalence).");
  console.log("==================================================");
}

runReproducibleBuildVerification();
