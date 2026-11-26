# Platform Adapters: Implementation and Validation Status

Adapter code and deployment templates describe possible integrations; their presence does not certify a deployment target.

| Target / adapter | Current evidence in Phase 10.3 | Status |
|---|---|---|
| Windows x64 standalone CLI | Packaged and smoke tested locally, including extracted ZIP | Host-validated |
| Linux / macOS / ARM64 runtime artifacts | Not built and run in this audit | Unverified |
| OCI / Docker image | Template checks only; no image build or execution | Unverified |
| Vercel, AWS Lambda, other serverless adapters | Adapter/template code may exist; production deployment was not exercised | Experimental / unverified |

The Windows `hkd build --native` output is a native executable launcher embedding HKDB bytecode and the Zig bytecode interpreter. The HKD program itself is not compiled into native machine code. JIT execution is not integrated in version 1.1.0. See [`platform-support.md`](platform-support.md) for the host-validation boundary.
