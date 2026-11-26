# Package Architecture

HKD projects declare package metadata and dependencies in `hkd.toml`. The package manager resolves dependencies and records locked versions and integrity information in `hkd.lock`.

Packages can be consumed from supported local paths, archives, and configured registry endpoints. The public project does not operate a central package registry service. Package archive integrity checks reduce tampering risk; package code remains executable code and should be reviewed before use.

The package workflow is separate from program execution: the compiler emits HKDB bytecode, which runs in the TypeScript reference VM or the Zig bytecode interpreter. JIT dispatch and native-code AOT are unavailable.

See [package guide](package-guide.md), [manifest reference](package-manifest.md), [archive format](package-format.md), and [lockfile documentation](lockfile.md).
