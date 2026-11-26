# Continuous Integration

The repository workflow in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on pushes to `main` and `develop` and on pull requests targeting `main`.

The configured jobs run ESLint, TypeScript typecheck and build, Zig runtime tests and startup smoke checks, CLI correctness checks, dependency diagnostics, and a Linux x64 container build and runtime check. All six architecture-matched host runners build and smoke-test a standalone TAR.GZ package; the Windows ARM64 runtime is cross-built on Ubuntu x64, then run on a Windows ARM64 runner.

The Jest suite and its fixtures are kept in a private maintainer archive and are not included or run by public CI. Machine-readable job outcomes record `jest: NOT_RUN_PRIVATE_ARCHIVE`. A successful workflow therefore does not mean the Jest regression suite ran.

Machine-readable CI evidence, container logs, and successfully verified host packages are uploaded as workflow artifacts from runner temporary directories. Package artifacts expire after seven days and are for validation only. CI does not publish official packages, create releases, or deploy production.
