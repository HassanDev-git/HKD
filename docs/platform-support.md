# Platform Support

HKD 1.1.0 is a Node.js application with an optional Zig bytecode interpreter. The CI workflow exercises native builds and runtime smoke checks on these hosted runners:

| Runner | Node.js | Zig/runtime evidence |
|---|---:|---|
| Ubuntu x64 | 22 and 24 | Native Zig tests, ReleaseFast runtime, CLI smoke checks |
| Ubuntu ARM64 | 24 | Native Zig tests, ReleaseFast runtime, CLI smoke checks |
| Windows x64 | 24 | Native Zig tests, ReleaseFast runtime, CLI checks and standalone packaging smoke test |
| Windows ARM64 | 24 | Native Zig tests; ReleaseFast runtime cross-built on Ubuntu x64 and executed on Windows ARM64 |
| macOS x64 | 24 | Native Zig tests, ReleaseFast runtime, CLI smoke checks |
| macOS ARM64 | 24 | Native Zig tests, ReleaseFast runtime, CLI smoke checks |

The workflow also builds and runs a Linux x64 container image, checks non-root execution, and verifies diagnostics for an invalid HKD program. These results apply to the exact workflow revision and hosted runner images; they do not certify every supported Node.js version, Linux distribution, deployment environment, or release package.

The standalone package smoke check currently runs on Windows x64 only. No official release packages are published by this repository. Cross-builds are not described as runtime certification unless the target executable is run on an architecture-matched runner.

WebAssembly/WASI is deferred. The TypeScript reference VM and Zig runtime interpret HKD bytecode; neither compiles HKD source to native machine code. JIT dispatch and native-code AOT are unavailable.
