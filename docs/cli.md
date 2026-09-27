# HKD 1.0.0 Command Line Interface (CLI) Reference

## 1. Exit Codes
HKD commands return standardized process exit codes:

| Code | Name | Description |
| :---: | :--- | :--- |
| `0` | **Success** | Command completed successfully with no errors. |
| `1` | **Runtime Error** | Program panicked or threw an unhandled runtime error. |
| `2` | **Usage Error** | Invalid command-line arguments or unknown flags. |
| `3` | **Config Error** | Invalid configuration file, missing environment variable, or manifest syntax error. |
| `4` | **Build Error** | Source compilation failure, type error, or dependency resolution failure. |
| `5` | **Deploy Error** | Release verification failed, checksum mismatch, or deployment check failure. |

---

## 2. Command Index

### 2.1 Project Lifecycle
- `hkd init [dir] [name]`: Initializes a new HKD project.
- `hkd run [file.hkd]`: Executes an HKD source file or project entrypoint.
- `hkd build [--native] [--profile <p>]`: Compiles modules to bytecode or standalone native executable.
- `hkd test [file/dir] [--conformance] [--differential]`: Runs automated tests, conformance suite, or differential checks.
- `hkd check <file.hkd>`: Type-checks source without executing.

### 2.2 Package Management
- `hkd add <pkg> [version]`: Adds a package dependency to `hkd.toml`.
- `hkd remove <pkg>`: Removes a package dependency.
- `hkd install [--offline] [--locked]`: Resolves and installs dependencies.
- `hkd update [pkg]`: Updates dependencies within version constraints.
- `hkd pack`: Packages project into a hermetic `.hkdpack` archive.
- `hkd publish [--token <t>]`: Publishes package to registry.
- `hkd search <query>`: Searches packages.
- `hkd info <pkg>`: Displays package metadata.
- `hkd audit [--json]`: Audits package integrity and known vulnerabilities.
- `hkd cache <list|clean|verify>`: Manages content-addressed cache.
- `hkd ci`: Runs locked deterministic CI pipeline.

### 2.3 Tooling & Developer Experience
- `hkd lsp`: Starts Language Server Protocol (LSP 2.0).
- `hkd dap`: Starts Debug Adapter Protocol (DAP).
- `hkd fmt <file.hkd> [-w]`: Formats source code.
- `hkd lint <file.hkd>`: Lints source code for warnings and anti-patterns.
- `hkd repl`: Starts interactive REPL.
- `hkd doctor [--json]`: Diagnostics check for compiler, runtimes, and tooling.
- `hkd migrate [--dry-run]`: Upgrades project configuration and lockfile to 1.0.0 standards.

### 2.4 Production Deployment
- `hkd targets`: Lists supported canonical target triples.
- `hkd release [--profile <p>] [--target <t>]`: Packages standalone native binary and release bundle.
- `hkd verify-artifact <path>`: Cryptographically validates release bundle.
- `hkd verify-release`: Full automated release candidate acceptance audit.
- `hkd config [--json]`: Displays effective configuration with masked secrets.
- `hkd container <init|build>`: Generates multi-stage Dockerfile.
- `hkd platform <detect|list>`: Inspects platform adapter matrix.
- `hkd deploy [check|manifest] [--dry-run]`: Deployment checklist and dry-run inspector.
- `hkd sbom`: Generates CycloneDX 1.5 JSON Software Bill of Materials.
- `hkd runtime-info [--json]`: Observability and runtime resource statistics.
