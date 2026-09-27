# HKD CLI Reference Manual

The `hkd` executable provides a unified command suite for developing, testing, packaging, and deploying HKD applications.

```text
USAGE:
  hkd <command> [options]
```

---

## Commands

### Project Lifecycle

#### `hkd init [dir] [name] [--template <cli|lib|server>] [--edition <2026|2027>]`
Initializes a new HKD project.
- Defaults:
  - `template`: `cli`
  - `edition`: `2026`
- Examples:
  ```bash
  hkd init my-app
  hkd init my-lib --template lib --edition 2027
  ```

#### `hkd run [file.hkd] [args...]`
Executes an HKD project or standalone `.hkd` script.
- Flags:
  - `--release`: Compiles with release optimizations.
  - `--reference` / `--ts`: Runs using the reference TypeScript interpreter.
  - `--native`: Compiles to a standalone native binary and executes.
  - `--jit`: Enables JIT execution on supported architectures.
  - `--vm`: Forces register bytecode virtual machine execution.

#### `hkd build [options]`
Compiles project modules incrementally to `.hkdb` bytecode or native binaries.
- Flags:
  - `--release`: Generates release artifacts under `target/release`.
  - `--native <file.hkd>`: Emits a standalone executable containing embedded runtime.
  - `-o <path>`: Specifies output binary destination.

#### `hkd test [file/dir] [options]`
Discovers and executes tests matching `tests/**/*.test.hkd`.
- Flags:
  - `--filter <pattern>`: Filters tests by name pattern.
  - `--verbose`: Emits detailed per-test execution information.
  - `--quiet`: Minimal failure-only output.

---

### Code Quality & Inspection

#### `hkd fmt [file.hkd] [-w] [--check]`
Formats HKD source files using the canonical AST printer.
- If called with no file arguments inside a project, formats all `.hkd` files in `src/` and `tests/`.
- Flags:
  - `-w`, `--write`: Overwrites files in place.
  - `--check`: Returns exit code `1` if any file requires formatting without writing changes.

#### `hkd check [file.hkd]`
Runs the lexer, parser, and semantic type analyser without generating bytecode.
- When called without arguments in a project, validates `manifest.main`.

#### `hkd lint [file.hkd] [--fix]`
Lints code for unused imports, dead variables, unreachable code, and naming conventions.
- Flags:
  - `--fix`: Automatically repairs auto-fixable lint issues.

#### `hkd explain <error_code>`
Displays detailed documentation, causes, and recommended solutions for compiler error codes.
- Example:
  ```bash
  hkd explain E201
  hkd explain E301
  ```

#### `hkd doctor [--json]`
Inspects system prerequisites, paths, toolchains, and IDE integration status.

---

### Package & Dependency Management

#### `hkd add <pkg> [--path <path>] [--offline]`
Adds a dependency to `hkd.toml` and installs it.
- Forms:
  - Registry: `hkd add http@^1.0.0` or `hkd add http`
  - Local path: `hkd add --path ../my-lib` or `hkd add ../my-lib`
  - Archive: `hkd add ./vendor/my-lib-0.1.0.hkdpack`

#### `hkd remove <pkg>`
Removes a dependency from `hkd.toml`, prunes unused packages, and regenerates `hkd.lock`.

#### `hkd install [--offline] [--locked] [--vendor]`
Resolves and installs all dependencies declared in `hkd.toml`.
- Flags:
  - `--offline`: Resolves exclusively against the local cache.
  - `--locked`: Enforces strict matching against `hkd.lock` (aborts if changes detected).
  - `--vendor`: Copies dependencies directly into the local `vendor/` directory.

#### `hkd update [pkg] [--offline]`
Re-resolves dependencies within semver ranges declared in `hkd.toml`.
- If a package name is supplied, only that package is updated.

#### `hkd tree [--json]`
Visualizes the resolved dependency hierarchy.
- Flags:
  - `--json`: Outputs dependency graph in JSON format.

#### `hkd pack`
Creates a deterministic, reproducible `.hkdpack` binary package archive with SHA-256 integrity verification.

#### `hkd publish [--token <token>]`
Packs and publishes the package to the configured HKD package registry.

#### `hkd audit [--json]`
Audits installed packages for security vulnerabilities, path traversal risks, and checksum integrity.

#### `hkd cache <list|clean|verify>`
Manages the content-addressed package store (`.hkd/cache/packages`).
- `list`: Lists cached package versions and sizes.
- `clean`: Purges cached packages.
- `verify`: Re-computes SHA-256 checksums to verify archive integrity.

#### `hkd vendor`
Vendors all dependencies into a standalone `vendor/` folder for hermetic, offline builds.

---

### Release & Deployment

#### `hkd release [--target <triple>] [--profile <release|dist>]`
Packages an end-to-end production release bundle with checksum manifest.

#### `hkd verify-release [--json]`
Runs automated release acceptance gates (build, lockfile verification, test suite, security audit).

#### `hkd container <init|build>`
Generates and verifies an optimized multi-stage `Dockerfile`.

#### `hkd sbom`
Generates a CycloneDX 1.5 JSON Software Bill of Materials.
