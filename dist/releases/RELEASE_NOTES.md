# HKD 1.1.0 Windows x64 standalone CLI

This archive contains one file: `hkd.exe`, a Node.js Single Executable Application with the HKD TypeScript compiler, CLI, and reference VM bundled inside.

## Run it

Open PowerShell or Windows Terminal in the directory containing `hkd.exe`:

```powershell
.\hkd.exe --help
.\hkd.exe run .\src\main.hkd
```

With no arguments, the CLI prints usage and exits. Double-clicking a command-line executable closes its temporary console when the command exits; use a terminal to keep output visible. Regular `run` commands fall back to the bundled TypeScript VM if the separate native runtime is unavailable. `--jit` is explicitly unavailable in this release; other native VM options require `hkd-runtime.exe`.

## Verification recorded for this local recovery build

- TypeScript typecheck: passed.
- Jest: 120 suites and 1,048 tests passed on 2026-11-20.
- Zig ReleaseFast native-runtime build: passed on Windows x64.
- Standalone executable smoke checks: version, help, valid/invalid programs, clean-directory execution, and JIT rejection passed. Extracted-ZIP checks for version, help, valid/invalid programs, different-directory execution, and a clear missing-companion-runtime diagnostic passed.

## SHA-256

```text
b330a64e3f512542b2acbdea02e9b6af9b11bf193ef20f734fd618196d9a965d  windows-x64/hkd.exe
73f671aa1a827e2d4d39b9c681268fe99e0aa6325190a4ccddb45cb1a68ffe69  hkd-v1.1.0-windows-x64.zip
```

This checkout contains Windows x64 artifacts tested on the audit host; this is not clean-machine certification. Linux and macOS files are not included. No external release was published by this audit.
