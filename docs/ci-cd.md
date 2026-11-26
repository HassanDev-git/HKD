# Continuous Integration

The repository workflow in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on pushes to `main` and `develop` and on pull requests targeting `main`.

The configured jobs run ESLint, TypeScript typecheck and build, the Zig runtime tests and startup smoke check, CLI correctness checks, dependency diagnostics, and a Linux x64 container build and runtime check. The Windows x64 runner also exercises the standalone packaging script. The Windows ARM64 runtime is cross-built on Ubuntu x64, then run on a Windows ARM64 runner.

The Jest suite and its fixtures are kept in a private maintainer archive and are not included or run by public CI. Machine-readable job outcomes record `jest: NOT_RUN_PRIVATE_ARCHIVE`. A successful workflow therefore does not mean the Jest regression suite ran.

CI evidence and container logs are uploaded as workflow artifacts from the runner temporary directory. CI does not publish packages, create releases, or deploy production.
