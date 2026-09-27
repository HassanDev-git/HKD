# HKD Performance Regression & Benchmarking Policy

**Target Baseline**: HKD 1.1.0 Platform  
**Governance Standard**: Proven Performance (Rule 4: Zero Unproven Claims)  

---

## 1. Benchmarking Methodology

To ensure performance metrics reflect real-world execution rather than synthetic spikes or cold-cache noise, all benchmarks in HKD adhere to standard measurement protocols:

```text
Cold Start → Warmup Phase (≥ 5 iterations) → Sample Phase (≥ 50 iterations)
                                                      │
                                                      ▼
                       Statistical Reduction: Median, P95, Min, Max, Variance
```

### 1.1 Metric Requirements
For every benchmark workload, the harness must record:
- **Workload**: Deterministic input workload (e.g. 100,000 array iterations, 1,000 Result wraps).
- **Iterations**: Minimum 50 sample iterations following 5 warmup cycles.
- **Latency Distribution**: Median ($p_{50}$) and 95th percentile ($p_{95}$) execution time in milliseconds.
- **Memory Profile**: Peak Resident Set Size (RSS) and Heap Used allocations.
- **Environment Metadata**: Host CPU model, clock speed, core count, available RAM, OS version, and toolchain runtime version.

---

## 2. Regression Thresholds & Tolerances

| Metric Category | Permitted Variance Band | Release Blocker Threshold |
| :--- | :---: | :---: |
| **CLI & VM Startup Time** | $\le 5.0\%$ | $> 15.0\%$ degradation |
| **Numeric & Loop Throughput** | $\le 5.0\%$ | $> 10.0\%$ degradation |
| **Array Iterations (`map`, `filter`, `reduce`)** | $\le 7.0\%$ | $> 15.0\%$ degradation |
| **Result Unwrapping & Chaining** | $\le 5.0\%$ | $> 10.0\%$ degradation |
| **Memory Allocation (Heap / RSS Growth)** | $\le 5.0\%$ | $> 10.0\%$ degradation |

### 2.1 Action on Regression
- If measured degradation is **within permitted variance band ($\le 5.0\%$)**: Treated as environmental noise; release proceeds.
- If measured degradation **exceeds blocker threshold**: Treated as a `HIGH` performance regression. Requires profiling with flamegraphs, patch remediation, or explicit maintainer authorization before release publication.
