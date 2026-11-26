# Distribution

The repository currently provides source distribution. To build the CLI, install the locked dependencies and compile with TypeScript:

```sh
npm ci
npm run build
node dist/cli/main.js --help
```

There are no official pre-built packages or published release artifacts in this repository. CI smoke-tests the standalone packaging script on Windows x64; that is not a cross-platform release certification. The standalone launcher contains HKD bytecode and the Zig interpreter and does not compile HKD source to native machine code.

Do not treat ignored build output or locally generated archives as official releases. See [platform support](platform-support.md) and [build provenance](signing-provenance.md).
