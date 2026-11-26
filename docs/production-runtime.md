# Runtime Operations

The HKD CLI runs on Node.js 18 or newer. The optional Zig runtime interprets HKD bytecode and is built with Zig 0.16.0 in CI. See [platform support](platform-support.md) for the exact runner coverage.

HKD does not sandbox source programs. Run production workloads with the least operating-system privilege needed and apply the isolation controls appropriate to your environment. For containers, review the generated Dockerfile and host runtime configuration; CI's Linux x64 non-root check is scoped to that workflow image.

JIT dispatch, native-code AOT, signed release packages, and official pre-built platform packages are not available in this repository.
