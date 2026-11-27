# Platform Support

HKD 1.1.2 candidate is a Node.js application with an optional Zig bytecode interpreter. The CI workflow exercises native builds and runtime smoke checks on these hosted runners; candidate evidence must be reviewed from its actual run before release:

| Runner | Node.js | Zig/runtime evidence |
|---|---:|---|
| Ubuntu x64 | 22 and 24 | Native Zig tests, ReleaseFast runtime, CLI smoke checks; standalone package build and execution on Node 24 |
| Ubuntu ARM64 | 24 | Native Zig tests, ReleaseFast runtime, CLI smoke checks, standalone package build and execution |
| Windows x64 | 24 | Native Zig tests, ReleaseFast runtime, CLI checks, standalone package build and execution |
| Windows ARM64 | 24 | Zig tests compiled for `aarch64-windows` by the Windows x64 Zig compiler under OS emulation and executed on the ARM64 host; ReleaseFast runtime cross-built on Ubuntu x64, checksum-verified, and executed on Windows ARM64; standalone package build and execution |
| macOS x64 | 24 | Native Zig tests, ReleaseFast runtime, CLI smoke checks, standalone package build and execution |
| macOS ARM64 | 24 | Native Zig tests, ReleaseFast runtime, CLI smoke checks, standalone package build and execution |

The workflow packages HKD as a TAR.GZ with the executable, user documentation, installation instructions, a source-commit manifest, and SHA-256 sums. Each native runner extracts the package in a clean directory and checks version, help, valid program execution, and invalid-program diagnostics. The release workflow additionally generates a release-wide manifest and checksums, and publishes only after all six native jobs succeed. The workflow also builds and runs a Linux x64 container image, checks non-root execution, and verifies diagnostics for an invalid HKD program. These results apply to the exact workflow revision and hosted runner images; they do not certify every supported Node.js version, Linux distribution, or deployment environment.

No official release packages are published by this repository. Cross-builds are not described as runtime certification unless the target executable is run on an architecture-matched runner.

WebAssembly/WASI is deferred. The TypeScript reference VM and Zig runtime interpret HKD bytecode; neither compiles HKD source to native machine code. JIT dispatch and native-code AOT are unavailable.
