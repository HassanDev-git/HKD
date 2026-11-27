# HKD 1.1.1 Feature and Capability Matrix

This table describes the current implementation boundary. CI results are tied to the tested workflow revision; documentation, target names, and build configuration alone do not establish runtime support.

| Capability | Status | Notes |
|---|---|---|
| TypeScript compiler and reference VM | Implemented | Compiles HKD source to bytecode and interprets it in the CLI. |
| Zig bytecode interpreter | Implemented | Optional native runtime; CI runs Zig tests and a runtime startup check on configured runners. |
| Standalone CLI release package | Implemented | Published for six native platform targets; contains the CLI and TypeScript reference VM. See release manifest for runner provenance. |
| Optional Zig bytecode interpreter | Implemented, optional | Built and startup-tested on the configured native runners; not included in standalone CLI archives. |
| LSP and DAP servers | Implemented on current source | Current source starts both servers over stdio and package smoke tests initialize both. The immutable v1.1.1 standalone assets contain a CLI startup defect; see [known limitations](known-limitations.md). |
| VS Code extension | Separately packaged | Source can be built into a VSIX; no Marketplace publication or release attachment is currently provided. |
| JIT execution | Unavailable | Experimental code generation is not dispatched by HKD program execution. |
| Native-code AOT | Unavailable | HKD source is not compiled to machine code. |
| Traits / RFC-003 | Experimental | See [RFC-003 status](rfc-003-status.md). |
| Async/await syntax / RFC-004 | Experimental | See [RFC-004 status](rfc-004-status.md); library APIs do not establish language syntax support. |
| Container image | CI-verified scope | Linux x64 image build, non-root valid-program execution, and invalid-program diagnostics run in CI. |
| WebAssembly/WASI | Deferred | No WASM compiler or runtime is provided. |
| Automated Jest regression suite | Maintainer archive | Preserved outside the public source checkout; public CI does not run it. |

See [known limitations](known-limitations.md) and [platform support](platform-support.md) for scope and verification details.
