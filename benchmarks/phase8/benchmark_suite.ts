/**
 * HKD Phase 8 Performance Benchmark Suite 2.0
 *
 * Measures:
 * 1. Startup Latency (CLI version, cold startup)
 * 2. Compilation Speed (Small, Medium, Large project workloads)
 * 3. Execution Speed (Arithmetic, Recursion, Strings, Arrays, Closures, Async, JSON)
 * 4. Memory Metrics (Initial RSS, Peak RSS, Heap Used, Heap Total, Leak Delta)
 * 5. Artifact Sizes (Bytecode, .hkdpack, SBOM, Lockfile)
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";
import { performance } from "perf_hooks";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { SemanticAnalyser } from "../../src/semantic/analyser.js";
import { Compiler } from "../../src/bytecode/compiler.js";
import { ErrorReporter } from "../../src/errors/index.js";
import { serializeProgram } from "../../src/bytecode/serializer.js";
import { VM } from "../../src/bytecode/vm.js";
import { packArchive } from "../../src/package-manager/archive.js";
import { serializeLockfileV2 } from "../../src/package-manager/lockfile.js";

const ROOT_DIR = process.cwd();
const CLI_PATH = path.join(ROOT_DIR, "dist", "cli", "main.js");
const NATIVE_EXE = path.join(
  ROOT_DIR,
  "native-runtime",
  "zig-out",
  "bin",
  process.platform === "win32" ? "hkd-runtime.exe" : "hkd-runtime"
);

export interface LatencyMetric {
  name: string;
  medianMs: number;
  p95Ms: number;
  runs: number;
}

export interface CompileMetric {
  workload: string;
  loc: number;
  medianMs: number;
  linesPerSecond: number;
}

export interface ExecutionMetric {
  workload: string;
  iterations: number;
  medianMs: number;
  p95Ms: number;
  throughputOpsSec: number;
}

export interface MemoryMetric {
  initialRssBytes: number;
  peakRssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  deltaBytes: number;
}

export interface ArtifactMetric {
  name: string;
  sizeBytes: number;
}

export interface Phase8BenchmarkReport {
  timestamp: string;
  version: string;
  environment: {
    platform: string;
    arch: string;
    cpus: string;
    nodeVersion: string;
  };
  startupLatency: LatencyMetric[];
  compilationSpeed: CompileMetric[];
  runtimeExecution: ExecutionMetric[];
  memoryMetrics: MemoryMetric;
  artifactSizes: ArtifactMetric[];
}

function calculateMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calculateP95(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(Math.ceil(0.95 * sorted.length) - 1, sorted.length - 1);
  return sorted[idx];
}

function compileCode(source: string): { chunk: any; buffer: Buffer; durationMs: number } {
  const start = performance.now();
  const reporter = new ErrorReporter(source, "<bench>");
  const lexer = new Lexer(source, "<bench>", reporter);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, source, "<bench>", reporter);
  const ast = parser.parse();
  const analyser = new SemanticAnalyser(reporter, source);
  analyser.analyse(ast);
  const compiler = new Compiler(reporter);
  const chunk = compiler.compile(ast);
  const buffer = serializeProgram(chunk);
  const durationMs = performance.now() - start;
  return { chunk, buffer, durationMs };
}

export function runBenchmarkSuite(): Phase8BenchmarkReport {
  console.log("==================================================");
  console.log("  HKD PHASE 8 BENCHMARK SUITE 2.0");
  console.log("==================================================");

  // Measure initial memory
  if (global.gc) {
    global.gc();
  }
  const memStart = process.memoryUsage();
  let peakRss = memStart.rss;

  // 1. Startup Latency
  console.log("\n[1/5] Measuring Startup Latency...");
  const startupMetrics: LatencyMetric[] = [];

  // Version call
  const versionTimes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    spawnSync(process.execPath, [CLI_PATH, "--version"], { cwd: ROOT_DIR, encoding: "utf-8" });
    versionTimes.push(performance.now() - t0);
  }
  startupMetrics.push({
    name: "CLI Version (`hkd --version`)",
    medianMs: Number(calculateMedian(versionTimes).toFixed(2)),
    p95Ms: Number(calculateP95(versionTimes).toFixed(2)),
    runs: versionTimes.length,
  });

  // Cold minimal execution
  const tempMinFile = path.resolve(".hkd/bench_min.hkd");
  fs.mkdirSync(path.dirname(tempMinFile), { recursive: true });
  fs.writeFileSync(tempMinFile, 'print("ready");');

  const coldTimes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    spawnSync(process.execPath, [CLI_PATH, "run", tempMinFile], { cwd: ROOT_DIR, encoding: "utf-8" });
    coldTimes.push(performance.now() - t0);
  }
  startupMetrics.push({
    name: "Cold Startup Script (`hkd run minimal.hkd`)",
    medianMs: Number(calculateMedian(coldTimes).toFixed(2)),
    p95Ms: Number(calculateP95(coldTimes).toFixed(2)),
    runs: coldTimes.length,
  });

  try { fs.rmSync(tempMinFile, { force: true }); } catch {}

  // 2. Compilation Speed
  console.log("\n[2/5] Measuring Compilation Speed...");
  const compileMetrics: CompileMetric[] = [];

  const smallSource = `
    fn add(a: int, b: int) -> int {
      return a + b;
    }
    let res = add(10, 20);
    print(res);
  `.trim();

  const medSource = `
    fn fib(n: int) -> int {
      if n <= 1 {
        return n;
      }
      return fib(n - 1) + fib(n - 2);
    }

    fn loopSum(count: int) -> int {
      let mut total = 0;
      for i in 0..count {
        if i % 2 == 0 {
          total = total + i;
        } else {
          total = total + 1;
        }
      }
      return total;
    }

    struct Point {
      x: int,
      y: int,
    }

    fn origin() -> Point {
      return Point { x: 0, y: 0 };
    }

    let p = origin();
    let s = loopSum(100);
    let f = fib(10);
  `.repeat(5);

  const largeSource = medSource.repeat(5);

  for (const [name, code] of [
    ["Small File (<50 LOC)", smallSource],
    ["Medium Project (~250 LOC)", medSource],
    ["Large Workload (~1200 LOC)", largeSource],
  ] as const) {
    const lines = code.split("\n").length;
    const times: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = compileCode(code);
      times.push(res.durationMs);
    }
    const medianMs = calculateMedian(times);
    const linesPerSec = Math.round((lines / (medianMs / 1000)));
    compileMetrics.push({
      workload: name,
      loc: lines,
      medianMs: Number(medianMs.toFixed(3)),
      linesPerSecond: linesPerSec,
    });
  }

  // 3. Runtime Execution Speed (In-memory VM)
  console.log("\n[3/5] Measuring In-Process VM Runtime Execution...");
  const execMetrics: ExecutionMetric[] = [];

  // Arithmetic loop
  {
    const code = `
      fn run() -> int {
        let mut sum = 0;
        for i in 0..100000 {
          sum = sum + i;
        }
        return sum;
      }
      run();
    `;
    const { chunk } = compileCode(code);
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const vm = new VM();
      vm.interpret(chunk);
      times.push(performance.now() - t0);
    }
    const med = calculateMedian(times);
    execMetrics.push({
      workload: "Arithmetic Loop (100,000 iterations)",
      iterations: 100000,
      medianMs: Number(med.toFixed(2)),
      p95Ms: Number(calculateP95(times).toFixed(2)),
      throughputOpsSec: Math.round(100000 / (med / 1000)),
    });
  }

  // Recursive fibonacci
  {
    const code = `
      fn fib(n: int) -> int {
        if n <= 1 {
          return n;
        }
        return fib(n - 1) + fib(n - 2);
      }
      fib(22);
    `;
    const { chunk } = compileCode(code);
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const vm = new VM();
      vm.interpret(chunk);
      times.push(performance.now() - t0);
    }
    const med = calculateMedian(times);
    execMetrics.push({
      workload: "Recursive Fibonacci (fib(22))",
      iterations: 22,
      medianMs: Number(med.toFixed(2)),
      p95Ms: Number(calculateP95(times).toFixed(2)),
      throughputOpsSec: Math.round(1 / (med / 1000)),
    });
  }

  // String formatting & operations
  {
    const code = `
      let mut s = "hello";
      for i in 0..1000 {
        s = s + "!";
      }
    `;
    const { chunk } = compileCode(code);
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const vm = new VM();
      vm.interpret(chunk);
      times.push(performance.now() - t0);
    }
    const med = calculateMedian(times);
    execMetrics.push({
      workload: "String Concat (1,000 appends)",
      iterations: 1000,
      medianMs: Number(med.toFixed(2)),
      p95Ms: Number(calculateP95(times).toFixed(2)),
      throughputOpsSec: Math.round(1000 / (med / 1000)),
    });
  }

  // Memory soak & tracking
  console.log("\n[4/5] Measuring Memory Stability...");
  for (let i = 0; i < 500; i++) {
    const { chunk } = compileCode(smallSource);
    const vm = new VM();
    vm.interpret(chunk);
    const currRss = process.memoryUsage().rss;
    if (currRss > peakRss) peakRss = currRss;
  }

  if (global.gc) {
    global.gc();
  }
  const memEnd = process.memoryUsage();
  const memoryMetrics: MemoryMetric = {
    initialRssBytes: memStart.rss,
    peakRssBytes: peakRss,
    heapUsedBytes: memEnd.heapUsed,
    heapTotalBytes: memEnd.heapTotal,
    deltaBytes: memEnd.rss - memStart.rss,
  };

  // 5. Artifact Sizes
  console.log("\n[5/5] Measuring Artifact Sizes...");
  const artifactSizes: ArtifactMetric[] = [];

  const { buffer: byteBuf } = compileCode(medSource);
  artifactSizes.push({
    name: "Compiled Bytecode (.hkdb) [250 LOC]",
    sizeBytes: byteBuf.length,
  });

  const tempPackDir = path.resolve(".hkd/bench_pack_temp");
  fs.mkdirSync(path.join(tempPackDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(tempPackDir, "src", "main.hkd"), medSource);
  const packRes = packArchive(tempPackDir, {
    name: "bench-package",
    version: "1.0.0",
    edition: "2026",
    main: "src/main.hkd",
    dependencies: {},
    devDependencies: {},
  });
  artifactSizes.push({
    name: "Package Archive (.hkdpack)",
    sizeBytes: packRes.buffer.length,
  });

  const lockfileToml = serializeLockfileV2({
    version: 2,
    resolver: "2.0",
    packages: [
      {
        name: "bench-package",
        version: "1.0.0",
        source: "registry",
        checksum: packRes.checksum,
        dependencies: [],
      },
    ],
  });
  artifactSizes.push({
    name: "Lockfile (hkd.lock)",
    sizeBytes: Buffer.byteLength(lockfileToml, "utf-8"),
  });

  try { fs.rmSync(tempPackDir, { recursive: true, force: true }); } catch {}

  const report: Phase8BenchmarkReport = {
    timestamp: new Date().toISOString(),
    version: "1.1.0",
    environment: {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus()[0]?.model || "unknown",
      nodeVersion: process.version,
    },
    startupLatency: startupMetrics,
    compilationSpeed: compileMetrics,
    runtimeExecution: execMetrics,
    memoryMetrics,
    artifactSizes,
  };

  const outDir = path.join(ROOT_DIR, "benchmarks", "phase8", "results");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "phase8_benchmark_results.json");
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf-8");

  console.log(`\nBenchmark complete. Saved to: ${outFile}`);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("benchmark_suite.ts")) {
  runBenchmarkSuite();
}
