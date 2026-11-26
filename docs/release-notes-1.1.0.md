# HKD 1.1.0 Release Notes

HKD 1.1.0 adds language and toolchain capabilities on top of the 1.0 language baseline.

## Highlights

- Expanded static typing, generics, and pattern-matching support, with some features edition-gated or experimental.
- Added a TypeScript compiler and reference bytecode VM, alongside an optional Zig bytecode interpreter.
- Added CLI support for compiling and running HKD programs and creating standalone bytecode bundles with the native interpreter launcher.
- Expanded package-management workflows and documentation for bytecode, the language server, and debugger protocol.

## Boundaries

Traits and language-level async/await remain experimental. JIT dispatch, native-code AOT, and WebAssembly/WASI compilation are not available. The Zig runtime interprets bytecode; a standalone bundle does not compile HKD source to machine code.

See the [getting started guide](getting-started.md), [feature matrix](feature-matrix.md), [platform support](platform-support.md), and [known limitations](known-limitations.md) for current usage and verification scope.
