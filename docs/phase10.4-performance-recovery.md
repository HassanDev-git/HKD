# HKD Phase 10.4 — Performance Recovery and Cross-Platform Audit

**Status: INCOMPLETE.** This audit did not reproduce the reported broad slowdown, and Linux/macOS/ARM64/container/clean-machine checks remain outstanding. It applies no speculative runtime changes.

## Baseline and method

Branch `main`, HEAD `2f900993741d18bf38f4de3815b5fbd92f37ff91`; the working tree was already dirty from Phase 10.3. October measurements were preserved. The Phase 9 canonical runner ran on Windows x64 with Node v24.19.0 and Zig 0.16.0. It uses 18 unchanged workloads, 3 warmups and 5 measurements per run. Three independent runs passed all output checks; the table uses the median of the 15 current raw samples per workload.

## Benchmark comparison

| Workload | Oct 24 baseline (ms) | Phase 10.3 Nov 20 (ms) | Phase 10.4 pooled median (ms) | Change vs Oct |
|---|---:|---:|---:|---:|
| CLI Version Startup | 170.7234 | 653.3075 | 164.4148 | -3.7% |
| Cold Script Startup | 191.3679 | 962.3257 | 223.8391 | 17% |
| Small Source Compilation | 0.6201 | 5.2218 | 0.7462 | 20.3% |
| Medium Project Compilation | 2.0257 | 10.5105 | 1.744 | -13.9% |
| Large Workload Compilation | 13.8275 | 64.9023 | 16.6847 | 20.7% |
| Integer Arithmetic Loop | 79.745 | 256.3952 | 92.7999 | 16.4% |
| Floating-Point Numeric Math | 65.2671 | 286.4957 | 72.4478 | 11% |
| Tight Loop Counter | 134.7659 | 490.6383 | 159.6454 | 18.5% |
| Multi-Way Branching Logic | 87.831 | 248.3685 | 84.4282 | -3.9% |
| Nested 2D Loop Traversal | 50.4568 | 121.707 | 50.0132 | -0.9% |
| Function Invocation Overhead | 64.0104 | 323.9131 | 68.8676 | 7.6% |
| Recursive Fibonacci (n=20) | 14.7781 | 62.6063 | 14.5105 | -1.8% |
| String Concatenation & Length | 4.6693 | 24.3042 | 3.9799 | -14.8% |
| Array Growth & Element Append | 8.7474 | 36.8768 | 10.7442 | 22.8% |
| Struct Property Mutation | 33.8608 | 145.4316 | 32.0715 | -5.3% |
| Heap Allocation & GC Churn | 8.1815 | 33.1242 | 7.1811 | -12.2% |
| Repeated Steady-State Loop | 46.4245 | 201.6013 | 43.2753 | -6.8% |
| Async Task Execution (RFC-004) | 1.6234 | 9.1275 | 1.432 | -11.8% |

The Phase 10.3 report showed 3x–5x slower timings on many workloads. The canonical Phase 10.4 reruns returned near the October values for most workloads, so that large slowdown did not reproduce. A few workloads show modest 10–23% changes, but their measurements vary substantially across runs; the runner does not capture CPU load, frequency, power mode, or thermal state. The October-to-November differences therefore do not prove a source regression.

## Diagnosis and profiling

Node CPU sampling placed the runtime workload samples primarily in `VM.execute` (1,343 sampled hits) and `VM.push` (479). A large-compiler profile sampled garbage collection, lexer tokenization, compiler function emission, and bytecode serialization. Those identify expected hot work; no October profile exists for comparison. The bytecode VM and compiler source were not modified in the tracked Phase 10.3 diff. The only direct runtime pipeline change there clears module/import caches between independent executions. It prevents stale module state; profiling does not show that it explains the large November slowdown.

**Root cause: UNKNOWN / not reproduced.** The evidence does not justify a VM/compiler optimization. No optimization was applied, and no performance improvement is claimed. Preserve the anomaly as an unresolved environment or measurement candidate until repeated runs also record host load and CPU state.

## Startup and memory

CLI version startup pooled median: 164.4148 ms versus 170.7234 ms in October. Cold script startup: 223.8391 ms versus 191.3679 ms. The release verifier ran three warmed 10,000-cycle memory trials; worst RSS ratio was 1.03. This is bounded evidence, not a zero-leak claim.

## Verification

- TypeScript typecheck: PASS.
- Jest: 120 suites / 1,048 tests PASS when run outside the sandbox. The sandbox run had loopback `EACCES` and Zig process errors; those failures disappeared outside the sandbox.
- Zig 0.16.0 tests: 9/9 PASS; ReleaseFast build: PASS.
- Release verifier: 14/14 dimensions pass, 0 blockers, 1 warning, Windows x64 host only.
- Fresh ZIP extraction in a separate temporary working directory: version, help, TypeScript fallback execution, invalid-program diagnostic, `--vm` missing-runtime diagnostic, and JIT rejection all PASS. This is same-machine extraction, not clean-machine certification.
- ESLint: FAIL because `npm run lint` has no ESLint configuration file.

## Platform matrix

| Target | Status | Evidence |
|---|---|---|
| Windows x64 | PASS | Local tests and release verification; fresh ZIP smoke check on this host. |
| Linux | BLOCKED locally | WSL2 cannot start because virtualization/Virtual Machine Platform is unavailable. The committed HEAD passed Ubuntu CI on 2026-10-01; local Phase 10.3/10.4 changes were not in that run. |
| macOS | NOT TESTED locally | The committed HEAD passed `macos-latest` CI on 2026-10-01. Current local changes were not in that run, and runner architecture was not recorded. |
| ARM64 | NOT TESTED | No ARM64 execution. The upstream release job targeting `aarch64-macos` was cancelled on 2026-10-01. |
| Container | BLOCKED locally | Docker/Podman absent and WSL2 unavailable. The committed HEAD passed Docker Buildx CI on 2026-10-01; local changes were not in that run. |
| Clean-machine Windows | NOT TESTED | Temporary fresh extraction only; no clean VM/device. |

The upstream [CI run for the committed HEAD](https://github.com/HassanDev-git/HKD/actions/runs/36803013351) completed successfully on 2026-10-01, including Ubuntu, Windows, macOS and Docker Buildx jobs. It predates the uncommitted Phase 10.3/10.4 changes, so it is baseline evidence only. No current local changes are certified beyond Windows x64.

## Release and Git state

Windows executable and ZIP hashes were checked against `dist/artifacts.json`; both match. JIT and native machine-code AOT remain NOT IMPLEMENTED. Branch remains `main`, the worktree remains dirty, and no commit, push, tag, publish, or GitHub release was made.

Machine-readable evidence: [`../artifacts/phase10.4-audit.json`](../artifacts/phase10.4-audit.json).
