/**
 * HKD 1.1 Machine Benchmark & Baseline Generator
 * (benchmarks/measure-1.1.ts)
 *
 * Measures actual execution throughput, latency distributions (median, p95),
 * and memory metrics across standard HKD 1.1 workloads.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { performance } from "perf_hooks";
import { runSource } from "../src/runtime/index.js";

function getSystemInfo() {
  const cpus = os.cpus();
  return {
    os: `${os.type()} ${os.release()} (${os.platform()})`,
    arch: os.arch(),
    cpu: cpus.length > 0 ? cpus[0].model : "Unknown CPU",
    cores: cpus.length,
    ramBytes: os.totalmem(),
    ramGb: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2) + " GB",
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
  };
}

interface WorkloadResult {
  name: string;
  iterations: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  initialRssBytes: number;
  peakRssBytes: number;
  rssGrowthRatio: number;
}

function runWorkload(name: string, source: string, iterations = 50, edition: "2026" | "2027" = "2027"): WorkloadResult {
  // Warmup (5 cycles)
  for (let i = 0; i < 5; i++) {
    runSource(source, { edition, noExit: true, output: () => {} });
  }

  const times: number[] = [];
  const initialMem = process.memoryUsage();
  let peakRss = initialMem.rss;

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    runSource(source, { edition, noExit: true, output: () => {} });
    const t1 = performance.now();
    times.push(t1 - t0);

    const mem = process.memoryUsage();
    if (mem.rss > peakRss) peakRss = mem.rss;
  }

  times.sort((a, b) => a - b);
  const medianMs = times[Math.floor(times.length / 2)];
  const p95Ms = times[Math.floor(times.length * 0.95)];
  const minMs = times[0];
  const maxMs = times[times.length - 1];

  return {
    name,
    iterations,
    medianMs: Number(medianMs.toFixed(3)),
    p95Ms: Number(p95Ms.toFixed(3)),
    minMs: Number(minMs.toFixed(3)),
    maxMs: Number(maxMs.toFixed(3)),
    initialRssBytes: initialMem.rss,
    peakRssBytes: peakRss,
    rssGrowthRatio: Number((peakRss / initialMem.rss).toFixed(3)),
  };
}

async function main() {
  const sysInfo = getSystemInfo();
  const resultsDir = path.resolve(__dirname, "results");
  fs.mkdirSync(resultsDir, { recursive: true });

  fs.writeFileSync(
    path.join(resultsDir, "system-environment.json"),
    JSON.stringify(sysInfo, null, 2),
    "utf-8"
  );

  console.log("Measuring HKD 1.1 real workloads on host...");

  const workloads: WorkloadResult[] = [
    runWorkload("startup_minimal", 'let a = 1; let b = 2; let c = a + b;', 50, "2026"),
    runWorkload("generics_identity_loop", `
      fn identity<T>(x: T) -> T { return x; }
      let i = 0;
      while i < 100 {
        let _ = identity(i);
        i = i + 1;
      }
    `, 50, "2027"),
    runWorkload("pattern_matching_dispatch", `
      fn test_match(n: Int) -> String {
        return match n {
          1 => "one",
          2 => "two",
          3 => "three",
          _ => "other"
        };
      }
      let i = 0;
      while i < 100 {
        let _ = test_match(i % 5);
        i = i + 1;
      }
    `, 50, "2027"),
    runWorkload("array_functional_pipeline", `
      import array;
      fn is_even(n: Int) -> Bool { return n % 2 == 0; }
      fn double_val(n: Int) -> Int { return n * 2; }
      fn sum_acc(acc: Int, n: Int) -> Int { return acc + n; }

      let items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      let evens = array.filter(items, is_even);
      let doubled = array.map(evens, double_val);
      let _total = array.reduce(doubled, sum_acc, 0);
    `, 50, "2027"),
    runWorkload("result_monadic_chain", `
      import result;
      fn step1(n: Int) -> Result { return result.ok(n + 1); }
      fn step2(n: Int) -> Result { return result.ok(n * 2); }

      let r = result.ok(10);
      let r1 = result.and_then(r, step1);
      let _r2 = result.and_then(r1, step2);
    `, 50, "2027"),
  ];

  const baselineReport = {
    version: "1.1.0",
    generatedAt: new Date().toISOString(),
    system: sysInfo,
    workloads,
  };

  const baselinePath = path.resolve(__dirname, "baseline-1.1.json");
  fs.writeFileSync(baselinePath, JSON.stringify(baselineReport, null, 2), "utf-8");

  console.log(`PASS: Baseline written to ${baselinePath}`);
  for (const w of workloads) {
    console.log(`  - ${w.name}: median=${w.medianMs}ms, p95=${w.p95Ms}ms, RSS growth=${w.rssGrowthRatio}x`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
