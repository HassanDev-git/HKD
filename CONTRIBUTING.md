# Contributing to HKD

Thanks for your interest in HKD. Contributions should describe the behavior being changed and provide reproducible verification details.

## Development setup

Prerequisites: Node.js 18 or newer, npm, and Zig 0.16.0 for native runtime work.

```sh
git clone https://github.com/HassanDev-git/HKD.git
cd HKD
npm ci
npm run lint
npm run typecheck
npm run build
npx ts-node scripts/secret-scan.ts
node dist/cli/main.js --version
```

To run Zig's native tests from the repository root, use Zig 0.16.0:

```sh
zig test native-runtime/src/main.zig
```

The public checkout does not include the Jest suite. Maintainers preserve that suite in a private archive; public CI marks it `NOT_RUN_PRIVATE_ARCHIVE`. Do not describe that as a passing public test run.

## Changes and regression evidence

- Keep pull requests focused and include the commands and outcomes you actually ran.
- For compiler or runtime fixes, provide a minimal program that demonstrates the behavior and expected output or diagnostic.
- Keep stable language and bytecode behavior compatible unless an accepted RFC explicitly changes it.
- Classify incomplete or experimental features accurately in documentation.
- Do not include credentials, local machine paths, generated audit reports, or private test fixtures in public changes.

## Language changes

Non-trivial syntax and runtime changes should go through the RFC process in [`rfcs/`](rfcs/). Add user-facing language documentation and examples for implemented features.

## Pull requests

Use a clear summary, explain compatibility impact, link related discussions, and list verified commands with their results. CI runs lint, typecheck, build, Zig/runtime checks, CLI smoke checks, dependency diagnostics, and container verification on the configured runners.
