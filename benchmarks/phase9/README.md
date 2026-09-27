# HKD Phase 9 — Native Performance 2.0 & Compiler Optimization

This directory houses the standardized performance measurement and benchmarking infrastructure for HKD Phase 9.

## Architecture

```text
benchmarks/
├── phase8/               # Historical Phase 8 Developer Preview benchmark artifacts
├── phase9/
│   ├── workloads/        # Standardized 18 HKD workload source programs
│   ├── runner/           # Workload specifications and execution runners
│   ├── metrics/          # Deterministic statistics and system metadata engines
│   ├── results/          # Machine-readable benchmark run outputs
│   └── README.md         # This architecture and operations document
├── baseline_v1.json      # Official Authoritative Performance Baseline v1 (JSON)
└── baseline_v1.md        # Official Authoritative Performance Baseline v1 (Markdown report)
```

## Methodology

Every benchmark run strictly adheres to the following methodology:
- **18 Workloads** spanning startup, compiler throughput, integer arithmetic, floating-point math, tight loops, branching logic, nested loops, function call frames, recursion, strings, arrays, objects, runtime heap allocations, sustained steady-state loops, and async concurrency.
- **3 Warmup Iterations** to prime caches and isolate steady-state performance (discarded from statistics).
- **5 Measured Iterations** (retained individually in `samples_ms`).
- **Statistical Aggregation**: Min, Max, Mean, **Median (Primary Comparison Metric)**, p95, and p99 percentiles.
- **Timing Engine**: Monotonic high-resolution clock (`performance.now()`).
- **Process & Memory Tracking**: Monitored peak RSS (`process.memoryUsage().rss`) with process-level isolation.
- **Correctness Verification**: Every workload verifies actual output against expected output to guarantee semantic correctness.

## Execution & Reproduction

```bash
# 1. Build toolchain
npm run build

# 2. Run Phase 9A authoritative baseline suite
node benchmarks/phase9/runner/run_baseline.cjs
```
