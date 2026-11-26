# Security Boundaries

HKD is a language toolchain, not a security sandbox. Running untrusted HKD source grants the program the capabilities available through its runtime, operating-system account, and deployment environment. Use operating-system isolation for untrusted workloads.

## Compiler and runtime

- The TypeScript compiler and reference VM process source and bytecode in the privileges of the hosting Node.js process.
- The Zig runtime interprets HKD bytecode. JIT dispatch and native-code AOT are unavailable; experimental emitters are not an execution boundary.
- The language does not expose arbitrary raw pointer operations as a general application feature, but this is not a formal memory-safety or sandbox guarantee.
- Package integrity checks and archive path validation reduce specific tampering and extraction risks; they do not establish that third-party package code is trustworthy.

## Containers

The CI workflow builds and runs the generated Linux x64 image, checks its configured non-root user, and executes valid and invalid programs. Container isolation depends on the container engine, host kernel, runtime configuration, and deployment settings. Do not treat an image as a substitute for host security controls.

## JIT and native code

HKD 1.1 does not dispatch HKD programs through a JIT and does not compile HKD source to native code. No claim about W^X-protected JIT execution applies to this release.
