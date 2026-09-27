/**
 * HKD Phase 8 Performance Benchmark Runner
 *
 * Runs full benchmark suite using dist/ artifacts, outputs human-readable table
 * and writes machine-readable JSON to benchmarks/phase8/results/phase8_benchmark_results.json.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const { performance } = require("perf_hooks");

const { ErrorReporter } = require("../../dist/errors/index.js");
const { Lexer } = require("../../dist/lexer/lexer.js");
const { Parser } = require("../../dist/parser/parser.js");
const { SemanticAnalyser } = require("../../dist/semantic/analyser.js");
const { Compiler } = require("../../dist/bytecode/compiler.js");
const { serializeProgram } = require("../../dist/bytecode/serializer.js");
const { VM } = require("../../dist/vm/vm.js");
const { packArchive } = require("../../dist/package-manager/archive.js");
const { serializeLockfileV2 } = require("../../dist/package-manager/lockfile.js");

const ROOT_DIR = path.resolve(__dirname, "../../");
const CLI_PATH = path.join(ROOT_DIR, "dist", "cli", "main.js");

function calculateMedian(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calculateP95(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(Math.ceil(0.95 * sorted.length) - 1, sorted.length - 1);
  return sorted[idx];
}

function compileCode(source) {
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

function runBenchmarks() {
  console.log("================================================================================");
  console.log("                     HKD PHASE 8 BENCHMARK SUITE 2.0                            ");
  console.log("================================================================================");

  if (global.gc) {
    global.gc();
  }
  const memStart = process.memoryUsage();
  let peakRss = memStart.rss;

  // 1. Startup Latency
  console.log("\n[1/5] Measuring Startup Latency...");
  const startupMetrics = [];

  const versionTimes = [];
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

  const tempMinFile = path.resolve(ROOT_DIR, ".hkd/bench_min.hkd");
  fs.mkdirSync(path.dirname(tempMinFile), { recursive: true });
  fs.writeFileSync(tempMinFile, 'print("ready");');

  const coldTimes = [];
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

  console.log("  Startup Results:");
  for (const m of startupMetrics) {
    console.log(`    - ${m.name}: median ${m.medianMs} ms (p95: ${m.p95Ms} ms)`);
  }

  // 2. Compilation Speed
  console.log("\n[2/5] Measuring Compilation Speed & Throughput...");
  const compileMetrics = [];

  const smallSource = `
    fn add(a: int, b: int) -> int {
      return a + b;
    }
    let res = add(10, 20);
    print(res);
  `.trim();

  const medChunk = `
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
  `;
  const medSource = medChunk.repeat(15);
  const largeSource = medChunk.repeat(60);

  const workloads = [
    { name: "Small File (<50 LOC)", code: smallSource },
    { name: "Medium Project (~300 LOC)", code: medSource },
    { name: "Large Workload (~1200 LOC)", code: largeSource },
  ];

  for (const w of workloads) {
    const lines = w.code.split("\n").length;
    const times = [];
    for (let i = 0; i < 7; i++) {
      const res = compileCode(w.code);
      times.push(res.durationMs);
    }
    const medianMs = calculateMedian(times);
    const linesPerSec = Math.round(lines / (medianMs / 1000));
    compileMetrics.push({
      workload: w.name,
      loc: lines,
      medianMs: Number(medianMs.toFixed(3)),
      linesPerSecond: linesPerSec,
    });
    console.log(`    - ${w.name}: ${medianMs.toFixed(2)} ms (${linesPerSec.toLocaleString()} lines/sec)`);
  }

  // 3. Runtime Execution Speed
  console.log("\n[3/5] Measuring In-Process VM Runtime Execution...");
  const execMetrics = [];

  // Arithmetic loop
  {
    const code = `
      fn run() -> int {
        let mut sum = 0;
        for i in 0..50000 {
          sum = sum + i;
        }
        return sum;
      }
      run();
    `;
    const { chunk } = compileCode(code);
    const times = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const vm = new VM();
      vm.run(chunk);
      times.push(performance.now() - t0);
    }
    const med = calculateMedian(times);
    execMetrics.push({
      workload: "Arithmetic Loop (50,000 iterations)",
      iterations: 50000,
      medianMs: Number(med.toFixed(2)),
      p95Ms: Number(calculateP95(times).toFixed(2)),
      throughputOpsSec: Math.round(50000 / (med / 1000)),
    });
    console.log(`    - Arithmetic Loop: ${med.toFixed(2)} ms (${Math.round(50000 / (med / 1000)).toLocaleString()} iter/s)`);
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
      fib(20);
    `;
    const { chunk } = compileCode(code);
    const times = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const vm = new VM();
      vm.run(chunk);
      times.push(performance.now() - t0);
    }
    const med = calculateMedian(times);
    execMetrics.push({
      workload: "Recursive Fibonacci (fib(20))",
      iterations: 20,
      medianMs: Number(med.toFixed(2)),
      p95Ms: Number(calculateP95(times).toFixed(2)),
      throughputOpsSec: Math.round(1000 / med),
    });
    console.log(`    - Recursive Fibonacci: ${med.toFixed(2)} ms`);
  }

  // String operations
  {
    const code = `
      let mut s = "init";
      for i in 0..500 {
        s = s + "x";
      }
    `;
    const { chunk } = compileCode(code);
    const times = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const vm = new VM();
      vm.run(chunk);
      times.push(performance.now() - t0);
    }
    const med = calculateMedian(times);
    execMetrics.push({
      workload: "String Concat (500 appends)",
      iterations: 500,
      medianMs: Number(med.toFixed(2)),
      p95Ms: Number(calculateP95(times).toFixed(2)),
      throughputOpsSec: Math.round(500 / (med / 1000)),
    });
    console.log(`    - String Concat: ${med.toFixed(2)} ms`);
  }

  // 4. Memory Metrics
  console.log("\n[4/5] Measuring Memory Stability...");
  for (let i = 0; i < 300; i++) {
    const { chunk } = compileCode(smallSource);
    const vm = new VM(() => {});
    vm.run(chunk);
    const currRss = process.memoryUsage().rss;
    if (currRss > peakRss) peakRss = currRss;
  }

  if (global.gc) {
    global.gc();
  }
  const memEnd = process.memoryUsage();
  const memoryMetrics = {
    initialRssBytes: memStart.rss,
    peakRssBytes: peakRss,
    heapUsedBytes: memEnd.heapUsed,
    heapTotalBytes: memEnd.heapTotal,
    growthRatio: Number((memEnd.rss / memStart.rss).toFixed(3)),
    deltaBytes: memEnd.rss - memStart.rss,
  };
  console.log(`    - Initial RSS: ${(memStart.rss / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`    - Peak RSS: ${(peakRss / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`    - Heap Used: ${(memEnd.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`    - RSS Growth Ratio: ${memoryMetrics.growthRatio}x`);

  // 5. Artifact Sizes
  console.log("\n[5/5] Measuring Artifact Sizes...");
  const artifactSizes = [];

  const { buffer: byteBuf } = compileCode(medSource);
  artifactSizes.push({
    name: "Compiled Bytecode (.hkdb) [300 LOC]",
    sizeBytes: byteBuf.length,
  });

  const tempPackDir = path.resolve(ROOT_DIR, ".hkd/bench_pack_temp");
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

  for (const a of artifactSizes) {
    console.log(`    - ${a.name}: ${a.sizeBytes.toLocaleString()} bytes`);
  }

  const report = {
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

  console.log(`\nAll benchmarks successfully executed.`);
  console.log(`Machine-readable report written to: ${path.relative(ROOT_DIR, outFile)}`);
  console.log("================================================================================");
  return report;
}

runBenchmarks();
