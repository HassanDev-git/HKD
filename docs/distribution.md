# Distribution

Published standalone HKD CLI packages are available on [GitHub Releases](https://github.com/HassanDev-git/HKD/releases). HKD 1.1.1 provides Windows x64 and ARM64, Linux x64 and ARM64, and macOS x64 and ARM64 archives. Each release includes `SHA256SUMS` and `release-manifest.json`; use the manifest to inspect source commit, platform, architecture, runner and toolchain provenance.

The standalone CLI executable bundles Node.js and the TypeScript compiler/reference VM. A separate Node.js installation is not required to use a release package. The optional Zig runtime is not included in these CLI archives and can be built from source when needed.

The VS Code extension is distributed separately from the six CLI archives. Its source and local VSIX build process are in [`vscode-extension/`](../vscode-extension/README.md). The repository currently does not publish a Marketplace listing or attach the VSIX to the GitHub release.

To build the CLI from source:

```sh
npm ci
npm run build
node dist/cli/main.js --help
```

Official release packages are built and smoke-tested on native platform runners. See [platform support](platform-support.md), [build provenance](signing-provenance.md), and [known limitations](known-limitations.md) for the exact verification scope.
