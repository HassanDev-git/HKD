# HKD Phase 10.7 — Final Certification Report

**Status: INCOMPLETE**

## Decision

Ubuntu WSL2 now provides genuine Linux x64 execution evidence. Linux x64 certification still fails: the full Jest suite has 4 failing suites and 8 failing tests, and Zig 0.16 unit-test compilation is incompatible with the current Linux mmap/mprotect code. Docker/Podman remain unavailable. Windows ARM64, Linux ARM64, and both macOS targets remain unexecuted.

## Git state and preservation

- Initial: branch main, HEAD 2f900993741d18bf38f4de3815b5fbd92f37ff91, dirty with 134 existing entries before Ubuntu verification.
- Current: branch main, HEAD 2f900993741d18bf38f4de3815b5fbd92f37ff91, dirty with 134 entries before final report artifacts.
- Linux test/build execution occurred only in /home/redteam/HKD-phase10.7-linux. Its Git metadata and current source/untracked files were copied from the Windows tree; initial branch, HEAD, and status count matched. node_modules was excluded during copy and installed from the lockfile inside Ubuntu. The only local Git config adjustment was core.autocrlf=true in the Linux copy to match Windows status. Windows source files and Windows virtualization settings were not changed by Linux test execution.
- Prior blocked-state reports were preserved in artifacts/phase10.7-logs/. No commit, push, pull, merge, tag, publication, deployment, release, or remote GitHub write was performed.

## Ubuntu environment

Ubuntu 26.04.1 LTS, WSL2, kernel 6.18.58.1-microsoft-standard-WSL2, architecture x86_64; Node v22.23.5, npm 10.9.9, Zig 0.16.0. The Node Linux x64 tarball checksum was checked against its SHASUMS file. The Linux-native project copy is 1.9 GB; after setup, Ubuntu root had about 950 GB free. Docker and Podman are not installed.

## Linux x64 results

| Check | Result | Evidence |
|---|---|---|
| npm ci | **PASS with dependency advisories** | Exit 0; 435 packages installed. npm reported 7 vulnerabilities (6 moderate, 1 high); no automatic fixes were applied. |
| TypeScript typecheck/build | **PASS** | Both exit 0. |
| ESLint | **PASS with warnings** | Exit 0; 0 errors, 453 warnings. |
| CLI version/help | **PASS** | Both exit 0. |
| Valid/invalid HKD programs | **PASS** | Valid program exit 0; invalid source emitted E202 and exit 1. |
| Zig 0.16 unit tests / CI Zig helper | **FAIL** | zig test src/main.zig fails at src/jit/x86_64.zig: mmap protection flags use integers where Zig 0.16 requires a PROT struct; mprotect API is also unavailable as called. |
| Direct Linux ReleaseFast build/startup | **PASS** | zig build-exe src/main.zig -O ReleaseFast built successfully; generated runtime --version returned HKD 1.1.0. |
| Full Jest, after runtime build | **FAIL** | 4 suites failed, 118 passed; 8 tests failed, 1,062 passed, 1,070 total. |
| Package extraction/security and benchmark subset | **PASS** | 3 suites, 71 tests passed, including symlink extraction protections and benchmark validation. |
| Standalone parity/release gate | **FAIL** | Five differential cases and one verifier gate exited 2; output was USAGE: hkd-runtime [options] <file.hkdb>. Native VM execution passed after the runtime binary existed. |
| Deployment fuzzing | **FAIL** | The test expected an invalid result for ../../../etc/shadow, but verifyArtifact threw EACCES when the non-root user attempted to read it. |
| Docker/Podman container tests | **BLOCKED** | No engine installed in Ubuntu; no image build was attempted. |

The first Jest run occurred before a Linux runtime binary existed and had one additional dependent failure. A targeted recheck after ReleaseFast runtime creation showed the Windows-specific async test passing; the full rerun above is the final Linux suite result. A Zig PROT-struct experiment was confined to the Linux copy, exposed the subsequent mprotect incompatibility, and was reverted; the Linux source file was restored byte-for-byte from the Windows source. No source fix was applied.

## Platform status

| Platform | Result |
|---|---|
| Windows x64 | **PASS** — prior local evidence retained. |
| Linux x64 | **FAIL** — executed; required Zig/Jest checks have unresolved failures. |
| Windows ARM64 | **BLOCKED** — no architecture-matched run. |
| Linux ARM64 | **BLOCKED** — no architecture-matched run. |
| macOS x64 | **BLOCKED** — no architecture-matched run. |
| macOS ARM64 | **BLOCKED** — no architecture-matched run. |

## Remaining blockers

1. Update Linux Zig mmap/mprotect code for the locked Zig 0.16 API and rerun Zig tests.
2. Fix Linux standalone embedded-bytecode startup behavior and rerun parity/release verification.
3. Make artifact verification return a failure result for unreadable paths instead of throwing EACCES; rerun deployment fuzzing.
4. Build and execute a Docker/Podman image when an engine is available.
5. Obtain genuine Windows ARM64, Linux ARM64, macOS x64, and macOS ARM64 execution evidence.

**Phase 10.7 remains INCOMPLETE.** Full machine-readable results: [phase10.7-linux-local-results.json](phase10.7-linux-local-results.json) and [phase10.7-certification.json](phase10.7-certification.json). Linux command output is preserved in artifacts/phase10.7-logs/ubuntu/.
