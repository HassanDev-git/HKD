# Known Limitations

HKD 1.1.1 is under active development. Check the [feature matrix](feature-matrix.md) and [platform support](platform-support.md) for the current implementation and verification scope. Official release publication is gated on successful native builds and package checks for all six supported targets.

## Language and runtime

- The TypeScript compiler emits bytecode; the TypeScript reference VM and Zig runtime interpret it.
- JIT dispatch and native-code ahead-of-time compilation are unavailable. Experimental emitters do not change this boundary.
- Traits and language-level async/await are experimental and may have incomplete compiler or runtime support. Consult the corresponding RFC status before relying on them.
- A standalone native bundle embeds HKD bytecode in a native interpreter launcher. It does not compile the HKD program to machine code.

## Platforms and distribution

- CI exercises the host targets listed in [platform support](platform-support.md). That evidence does not certify arbitrary distributions, Node versions, or deployment environments.
- CI builds and executes standalone package smoke checks on all six listed native platform targets. A release candidate run retains its assets as workflow artifacts. The official release workflow publishes them only after all six jobs and the package manifest/checksum aggregation succeed.
- WebAssembly/WASI is deferred and is not a supported compilation target.

## Packages and services

The package client supports local archives, offline cache workflows, and configured registries. HKD does not operate a public package registry service.

## Test availability

The Jest regression sources and fixtures are retained in a private maintainer archive and are not present in the public checkout. Public CI reports the Jest suite as `NOT_RUN_PRIVATE_ARCHIVE`; it does not claim those tests passed.
