# HKD Benchmarking

Run the checked-in Phase 9 harness from the repository root:

```powershell
node benchmarks/phase9/runner/run_baseline.cjs --out artifacts/benchmark-local.json
```

The harness validates expected workload output, performs 3 warmups and 5 measured iterations, and records medians, ranges, process RSS snapshots, tool versions, operating system, architecture, and CPU information. Preserve old reports by using a new output path for each run.

The Phase 10.3 current run and repeat are recorded in [`../artifacts/phase10.3-benchmark-final.json`](../artifacts/phase10.3-benchmark-final.json) and [`../artifacts/phase10.3-benchmark-repeat.json`](../artifacts/phase10.3-benchmark-repeat.json). Both ran 18 workloads on Windows x64 with Node v24.19.0 and HKD 1.1.0. The program execution workloads use the TypeScript `runFile` / Stack VM path; CLI startup workloads start Node and `dist/cli/main.js`. They do not measure the Zig VM or JIT. RSS is sampled in the runner process, child-process peak RSS is not measured, and allocation counts are not instrumented. Startup and compiler timings are reported separately from VM workloads.

The current CLI startup medians were about 653 ms and 656 ms across the two runs, compared with 171 ms in the 2026-10-24 baseline; the integer-loop medians were 256 ms and 318 ms, compared with 80 ms. This is a repeatable slowdown candidate in this host environment, not an established source-code regression: workload outputs passed, but the cause of the host-level timing shift was not isolated. Do not infer a speedup or change VM architecture from these measurements alone.

These measurements are a host-specific baseline, not a performance guarantee or evidence of improvement. Compare only reports from equivalent workloads, VM paths, and sufficiently similar environments.

## Phase 10.4 rerun (2026-11-22)

The canonical Phase 9 runner was executed three times on the same Windows x64 host. All 18 workloads passed correctness checks in every run (3 warmups, 5 measured iterations per run). See [`../artifacts/phase10.4-audit.json`](../artifacts/phase10.4-audit.json) for all 18 pooled medians and raw samples. The large slowdown recorded on November 20 was not reproduced: most current medians are near the preserved October 24 baseline. Host CPU load, frequency, power and thermal state were not recorded, so the exact cause remains unknown. No optimization is claimed or applied without a repeatable source-level regression.
