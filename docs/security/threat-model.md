# Security Threat Model

This document describes relevant risks and the scope of current controls. HKD is not a sandbox and no formal security certification is claimed.

| Area | Example risk | Current boundary |
|---|---|---|
| Source and bytecode | Malformed input triggers a crash or resource exhaustion | Compiler and runtime validation reduce specific malformed-input risks; use OS resource controls for untrusted workloads. |
| Packages and archives | Tampered packages or paths escape the extraction directory | Lockfile integrity checks and archive path validation address specific cases; review package code before execution. |
| Host capabilities | HKD code reads or writes host data or starts available operations | Runtime access is bounded by the APIs and OS permissions available to the process; HKD does not provide a general sandbox. |
| Native runtime | Defect in Zig runtime affects the host process | The Zig component interprets bytecode; runtime correctness depends on implementation and compiler quality. |
| Containers | Container configuration grants excessive privileges | CI checks non-root execution for its Linux x64 image. Host, engine, and deployment configuration remain part of the trust boundary. |
| Credentials | Secrets are accidentally included in source or logs | CI runs a credential-pattern and local-path scan. This is a pattern scanner, not a guarantee that all secrets are detected. |

JIT dispatch and native-code AOT are unavailable in HKD 1.1; no JIT memory-protection or code-generation assurance is claimed. Vulnerability reports should follow [`SECURITY.md`](../../SECURITY.md).
