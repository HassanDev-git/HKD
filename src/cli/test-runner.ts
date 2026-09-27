/**
 * HKD Test Runner
 *
 * Discovers and runs test blocks in HKD files.
 *
 * Usage:
 *   hkd test           - runs all *.test.hkd files
 *   hkd test file.hkd  - runs tests in a specific file
 */

import * as fs from "fs";
import * as path from "path";
import { ErrorReporter } from "../errors/index.js";
import { Lexer } from "../lexer/lexer.js";
import { Parser } from "../parser/parser.js";
import { Compiler } from "../bytecode/compiler.js";
import { VM } from "../vm/vm.js";
import { registerStdlib } from "../stdlib/index.js";
import { loadModule } from "../runtime/index.js";
import { HkdValue, HkdFunction } from "../bytecode/chunk.js";
import { runDifferentialSuite } from "../tooling/differential.js";
import { detectFileEdition } from "../utils/index.js";

// ─── Colour helpers ───────────────────────────────────────────────────────────

const GREEN  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const RED    = (s: string) => `\x1b[31m${s}\x1b[0m`;
const BOLD   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const DIM    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const YELLOW = (s: string) => `\x1b[33m${s}\x1b[0m`;

// ─── Test result ──────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

interface TestSuite {
  file: string;
  results: TestResult[];
}

export interface TestOptions {
  filter?: string;
  verbose?: boolean;
  quiet?: boolean;
  conformance?: boolean;
  differential?: boolean;
}

export function runTests(target: string, opts: TestOptions = {}): void {
  if (opts.differential) {
    console.log(`\n${BOLD("HKD Cross-Runtime Differential Validation")}\n`);
    const files = collectTestFiles(target);
    const programs: Array<{ name: string; source: string }> = [];

    for (const f of files) {
      programs.push({
        name: path.basename(f),
        source: fs.readFileSync(f, "utf-8"),
      });
    }

    if (programs.length === 0) {
      // Default canonical differential suite
      programs.push(
        { name: "arithmetic", source: "let x = 10 + 20 * 2\nprintln(x)\n" },
        { name: "loops", source: "let mut s = 0\nfor i in 1..5 { s += i }\nprintln(s)\n" },
        { name: "closures", source: "fn make_adder(n) { return fn(x) { return x + n } }\nlet add5 = make_adder(5)\nprintln(add5(10))\n" },
        { name: "strings", source: "let s = \"HKD\" + \" 1.0.0\"\nprintln(s)\n" }
      );
    }

    const report = runDifferentialSuite(programs);
    for (const r of report.results) {
      const icon = r.equivalent ? GREEN("✓") : RED("✗");
      console.log(`  ${icon} ${r.programName.padEnd(20)} [VM & Native Equivalence: ${r.equivalent ? "PASS" : "MISMATCH"}]`);
    }

    console.log(`\n${GREEN(`  ${report.totalEquivalent}/${report.totalTested} execution tiers equivalent`)}`);
    console.log(DIM(`  Report written to reports/differential-final.json\n`));
    process.exit(report.allEquivalent ? 0 : 1);
  }

  if (opts.conformance) {
    console.log(`\n${BOLD("HKD 1.0 Language Conformance Test Suite")}\n`);
    const { spawnSync } = require("child_process");
    const res = spawnSync("npx", ["jest", "tests/conformance", "--runInBand"], { stdio: "inherit", shell: true });
    process.exit(res.status ?? 0);
  }

  const files = collectTestFiles(target);

  if (files.length === 0) {
    console.log(YELLOW("No test files found."));
    console.log(DIM("Create files ending in .test.hkd or use `test \"name\" { ... }` blocks."));
    process.exit(0);
  }

  if (!opts.quiet) {
    console.log(`\n${BOLD("HKD Test Runner")}\n`);
  }

  const suites: TestSuite[] = [];
  let totalPassed = 0;
  let totalFailed = 0;

  for (const file of files) {
    const suite = runTestFile(file, opts);
    suites.push(suite);

    const relPath = path.relative(process.cwd(), file);
    if (!opts.quiet || suite.results.some(r => !r.passed)) {
      console.log(`${BOLD(relPath)}`);
    }

    for (const result of suite.results) {
      if (opts.quiet && result.passed) continue;
      
      const icon = result.passed ? GREEN("✓") : RED("✗");
      const dur  = DIM(`(${result.duration}ms)`);
      console.log(`  ${icon} ${result.name} ${dur}`);
      if (!result.passed && result.error) {
        console.log(`    ${RED(result.error)}`);
      }
    }

    const passed = suite.results.filter((r) => r.passed).length;
    const failed = suite.results.filter((r) => !r.passed).length;
    totalPassed += passed;
    totalFailed += failed;

    if (!opts.quiet || failed > 0) {
      console.log("");
    }
  }

  // Summary
  const total = totalPassed + totalFailed;
  console.log("─".repeat(40));
  console.log(
    GREEN(`  ${totalPassed} passed`) +
    (totalFailed > 0 ? "  " + RED(`${totalFailed} failed`) : "") +
    DIM(`  (${total} total)`)
  );
  console.log("");

  process.exit(totalFailed > 0 ? 1 : 0);
}

// ─── Run tests in a single file ───────────────────────────────────────────────

function runTestFile(filePath: string, opts: TestOptions = {}): TestSuite {
  const results: TestResult[] = [];
  const registeredTests: Array<{ name: string; fn: HkdFunction }> = [];

  const source = fs.readFileSync(filePath, "utf-8");
  const fileName = path.resolve(filePath);
  const reporter = new ErrorReporter(source, fileName);

  const lexer = new Lexer(source, fileName, reporter);
  const tokens = lexer.tokenize();
  const edition = detectFileEdition(fileName);
  const parser = new Parser(tokens, source, fileName, reporter, edition);
  const ast = parser.parse();

  if (reporter.hasErrors()) {
    return {
      file: filePath,
      results: [{
        name: "<parse>",
        passed: false,
        error: reporter.format(),
        duration: 0,
      }],
    };
  }

  const compiler = new Compiler(reporter);
  const chunk = compiler.compile(ast);

  if (reporter.hasErrors()) {
    return {
      file: filePath,
      results: [{
        name: "<compile>",
        passed: false,
        error: reporter.format(),
        duration: 0,
      }],
    };
  }

  // Create VM with test hooks
  const vm = new VM((s) => process.stdout.write(s + "\n"));
  registerStdlib(vm);
  vm.defineNative("__import__", 1, (args) => {
    return loadModule(args[0] as string, vm, { fileName });
  });

  // Override __register_test__ to collect tests
  vm.defineNative("__register_test__", 2, (args) => {
    const fn = args[0] as HkdFunction;
    const name = args[1] as string;
    registeredTests.push({ name, fn });
    return null;
  });

  // Run the script to collect test registrations
  const runResult = vm.run(chunk);

  if (!runResult.ok) {
    return {
      file: filePath,
      results: [{
        name: "<setup>",
        passed: false,
        error: runResult.error,
        duration: 0,
      }],
    };
  }

  // Run each registered test
  for (const { name, fn } of registeredTests) {
    if (opts.filter && !name.toLowerCase().includes(opts.filter.toLowerCase())) {
      continue;
    }
    const start = Date.now();
    try {
      // Call the test function
      const testVm = new VM(() => {}); // suppress output during tests
      registerStdlib(testVm);

      // Copy globals from the main run VM
      // (This allows test functions to call functions defined in the file)
      const testChunk = fn.chunk;
      const scriptFn = {
        type: "function" as const,
        name: `test:${name}`,
        arity: 0,
        chunk: testChunk,
        upvalueCount: 0,
      };

      // We run via a specialized test invocation
      runTestFunction(vm, fn, name, results, start, filePath);
    } catch (e) {
      results.push({
        name,
        passed: false,
        error: String(e),
        duration: Date.now() - start,
      });
    }
  }

  return { file: filePath, results };
}

function runTestFunction(
  vm: VM,
  fn: HkdFunction,
  name: string,
  results: TestResult[],
  startTime: number,
  filePath: string
): void {
  // Use a capture approach: call the test fn through the VM
  // We compile a tiny wrapper: call the stored function
  const testVm = new VM(() => {}); // suppress print output during tests
  registerStdlib(testVm);
  testVm.defineNative("__import__", 1, (args) => {
    return loadModule(args[0] as string, testVm, { fileName: filePath });
  });

  for (const g of vm.getAllGlobals()) {
    testVm.setGlobal(g.name, g.value);
  }

  let passed = true;
  let error: string | undefined;

  try {
    // Direct function call approach
    const closure = { type: "closure" as const, fn, upvalues: [] };
    // Temporarily override the VM's run to call this closure directly
    testVm.setGlobal("__test_fn__", fn);

    // Create a tiny script: __test_fn__()
    // We'll use a simpler approach: capture errors from running the chunk directly
    const { ErrorReporter } = require("../errors/index.js");
    const { Lexer } = require("../lexer/lexer.js");
    const { Parser } = require("../parser/parser.js");
    const { Compiler } = require("../bytecode/compiler.js");

    const rep2 = new ErrorReporter("", "<test>");
    const testChunk = fn.chunk;

    // Run the function chunk directly (calling with 0 args)
    const scriptFn2 = {
      type: "function" as const,
      name: `test:${name}`,
      arity: 0,
      chunk: testChunk,
      upvalueCount: 0,
    };

    const testResult = testVm.run(testChunk);

    if (!testResult.ok) {
      passed = false;
      error = testResult.error;
    }
  } catch (e) {
    passed = false;
    error = String(e);
  }

  results.push({
    name,
    passed,
    error,
    duration: Date.now() - startTime,
  });
}

// ─── File discovery ───────────────────────────────────────────────────────────

function collectTestFiles(target: string): string[] {
  if (fs.existsSync(target)) {
    const stat = fs.statSync(target);
    if (stat.isFile()) return [path.resolve(target)];
    if (stat.isDirectory()) return findTestFiles(target);
  }
  return findTestFiles(process.cwd());
}

function findTestFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(d: string, inTestsFolder = false): void {
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full, inTestsFolder || entry.name === "tests");
        } else if (entry.isFile()) {
          const isTestFile = entry.name.endsWith(".test.hkd") || 
                             entry.name.endsWith("_test.hkd") ||
                             (inTestsFolder && entry.name.endsWith(".hkd"));
          if (isTestFile) {
            results.push(full);
          }
        }
      }
    } catch {}
  }

  walk(dir);
  return results;
}
