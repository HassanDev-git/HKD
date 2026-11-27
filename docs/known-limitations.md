# Known Limitations

HKD 1.1.2 is a release candidate and has not been tagged or published. The latest public release remains v1.1.1. Check the [feature matrix](feature-matrix.md) and [platform support](platform-support.md) for the implementation and verification scope.

## Language and runtime

- The TypeScript compiler emits bytecode; the TypeScript reference VM and Zig runtime interpret it.
- JIT dispatch and native-code ahead-of-time compilation are unavailable. Experimental emitters do not change this boundary.
- Traits and language-level async/await are experimental and may have incomplete compiler or runtime support. Consult the corresponding RFC status before relying on them.
- The standalone CLI archive bundles Node.js and the TypeScript reference VM. `hkd build --native` is a separate operation that uses the optional native bytecode interpreter; neither path compiles HKD source to machine code.
- The published v1.1.1 standalone executable has a CLI startup defect for `hkd lsp` and `hkd dap`, and its Doctor checks treat development-tree paths as required. The v1.1.2 candidate contains fixes; its six release packages have not yet been certified.

## Platforms and distribution

- CI exercises the host targets listed in [platform support](platform-support.md). That evidence does not certify arbitrary distributions, Node versions, or deployment environments.
- CI builds and executes standalone package smoke checks on all six listed native platform targets. A release candidate run retains its assets as workflow artifacts. The official release workflow publishes them only after all six jobs and the package manifest/checksum aggregation succeed.
- WebAssembly/WASI is deferred and is not a supported compilation target.

## Packages and services

The package client supports local archives, offline cache workflows, and configured registries. HKD does not operate a public package registry service.

The VS Code extension is separate from the CLI release archives. The 1.1.2 candidate VSIX has been packaged locally, but Marketplace publication and editor installation have not been verified. The published v1.1.1 executable cannot launch LSP and DAP; do not use it with the extension. Doctor reports an uninstalled extension and Zig runtime as optional. The Zig runtime is not included in standalone CLI archives.

## Test availability

The Jest regression sources and fixtures are retained in a private maintainer archive and are not present in the public checkout. Public CI reports the Jest suite as `NOT_RUN_PRIVATE_ARCHIVE`; it does not claim those tests passed.
