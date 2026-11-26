# HKD Phase 10.5 — CI and Performance Observability

**Status: INCOMPLETE.** Local Windows x64 improvements are implemented and exercised. The updated GitHub Actions matrix, container execution job, and non-Windows targets have not run against this uncommitted worktree.

## Initial state

- Branch `main`, HEAD `2f900993741d18bf38f4de3815b5fbd92f37ff91`, with 77 tracked paths modified and 13 untracked files before Phase 10.5 edits. Earlier Phase 10.3/10.4 changes and the retained executable backup were preserved.
- Existing successful GitHub Actions run `36803013351` was for the committed HEAD on 2026-10-01. It predates these local changes and is historical evidence only.
- Existing CI used `*-latest`, Node 20, omitted lint, did not run Zig tests, and only built a container image without executing it.
- `npm run lint` had no ESLint configuration. The generated container template fell back from failed `npm ci` and assumed every HKD program exposed an HTTP `/health` endpoint.

## Changes

- `.github/workflows/ci.yml` now defines Windows x64/ARM64, Ubuntu x64/ARM64, macOS x64/ARM64, plus a Node 22 compatibility row on Ubuntu x64. Node 24 is the primary matrix runtime. Jobs perform locked npm installation, lint, typecheck, TypeScript build, Jest, CLI behavior/exit-code checks, architecture-specific Zig tests and native build/startup, and Windows x64 package verification.
- `.github/workflows/release.yml` uses fixed Ubuntu 24.04, Windows 2025, and Apple Silicon macOS 15 runners with Node 24.
- `scripts/ci-smoke.cjs` checks version output, valid HKD execution, invalid source diagnostics, and non-zero failure exit status.
- `scripts/ci-zig.cjs` requires the runner-specific Zig package, runs `zig test src/main.zig`, builds ReleaseFast into a unique temporary directory, then starts that native executable and checks its version.
- The generated container uses locked installs and the Node 22 slim runtime, runs the selected HKD source as UID 10001, and does not claim an HTTP health endpoint. The CI container job builds and executes valid and invalid HKD programs and checks the non-root identity.
- `.eslintrc.json` enables recommended ESLint and TypeScript rules. Existing unused declarations, CommonJS lazy requires, explicit `any`, and deliberate VM loop conditions remain visible as warnings while remaining lint errors fail the command. One switch scope and one mutable binding were corrected.
- Benchmark output now records Zig version, benchmark command, one-minute CPU load where available, CPU frequency, power mode, and thermal data. Unsupported telemetry is recorded as explicitly unavailable. Raw samples remain present and sample standard deviation is included.
- `scripts/compare-benchmarks.cjs` validates correctness, exact workload IDs, execution paths, methodology, source revision, and consistent candidate environments before pooling repeated samples. A workload is only flagged for investigation when its median is at least 20% slower and the change exceeds two combined standard errors. Timing flags never fail CI. It emits JSON and Markdown.

## Local evidence (Windows x64, Node v24.19.0, Zig 0.16.0)

- TypeScript `typecheck` and build: PASS.
- ESLint: PASS, with 453 existing warnings in the full output at initial run; zero lint errors after the genuine switch-scope and `prefer-const` fixes. `npm run lint -- --quiet` exits successfully.
- Full Jest suite: 120 suites / 1,048 tests PASS outside the restricted sandbox. The first run exposed three stale container-template assertions; those expectations were updated, the affected 11 tests passed, and the full suite then passed.
- CLI version, valid source, invalid diagnostics, and exit status smoke checks: PASS.
- Zig native tests: 9/9 PASS. A direct ReleaseFast binary build to a unique temporary directory: PASS. The CI helper’s `zig build test` approach was replaced with the direct commands that work with the installed Zig 0.16.0 compiler.
- Release verifier: `HOST TARGET READY`, 14/14 dimensions, 0 blockers for `x86_64-windows`; this is host-only evidence.
- Current Phase 10.5 benchmark: 18/18 workloads correctness PASS, 3 warmups and 5 raw measured samples each. CPU model, core count, RAM, OS, architecture, Node, Zig, git state and raw samples are recorded. Windows load average, frequency, power mode, and thermal information are marked unavailable.
- October 24 baseline compared with three Phase 10.4 runs: all 18 workload IDs and execution paths match. `data_arrays` is flagged for investigation by the conservative rule; it is not an automatic source-regression finding.
- Container image execution: NOT TESTED locally; Docker/Podman are unavailable and WSL2 is disabled. Updated Docker Buildx CI has not run for this worktree.
- Linux, macOS, Windows ARM64, Linux ARM64, macOS ARM64, fresh clean-machine Windows, and local Windows standalone packaging: NOT TESTED in this phase. Workflow definitions do not count as execution evidence.

Raw Phase 10.5 benchmark evidence is in `artifacts/phase10.5-benchmark-current.json` and its Markdown companion. The comparison is in `artifacts/phase10.5-performance-comparison.json` and `.md`. Release verifier evidence is in `artifacts/phase10.5-release-verification.json`. October/Phase 10.4 benchmark artifacts were left intact.

## Remaining certification work

Run the updated workflow on GitHub from an authorized PR or branch to certify the six OS/architecture rows, Node compatibility, package job, and container execution. This worktree remains uncommitted and unpushed, so those jobs have not been triggered. Keep platform status incomplete until those runs succeed; investigate the `data_arrays` timing flag on a stable dedicated runner before attributing it to source changes.

Final local worktree: 96 tracked paths modified and 23 untracked paths, including preserved Phase 10.3/10.4 files and new Phase 10.5 evidence. Nothing was committed, pushed, tagged, or published.
