# Runtime and Deployment Overview

HKD compiles source code to bytecode. Programs run in the TypeScript reference VM or the optional Zig bytecode interpreter. A standalone bytecode bundle packages the Zig interpreter with compiled bytecode; it is not native-code AOT.

For containers, `hkd container init` generates a Docker build context. CI currently builds and executes a Linux x64 image, checks non-root execution, and runs valid and invalid programs. This check does not certify every host or deployment configuration.

The project does not publish official platform release packages. The standalone packaging smoke check currently covers Windows x64. See [platform support](platform-support.md) for the configured CI matrix and its boundaries.
