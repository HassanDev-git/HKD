# Security Guidance

HKD does not sandbox programs. Run programs with the least operating-system privilege they need, and use platform isolation for untrusted source or packages.

- Install from a reviewed source revision and use `npm ci` to honor the Node lockfile.
- Treat HKD packages and registry content as executable code; review their source and provenance before use.
- Keep credentials out of HKD source, package archives, container build contexts, and logs. Store secrets in the deployment environment and exclude local secret files from version control.
- For containers, review the generated image and host runtime settings. CI checks non-root execution for its Linux x64 image, but does not certify every deployment.
- The Zig runtime interprets bytecode. JIT dispatch and native-code AOT are unavailable; do not rely on JIT-specific W^X claims.

Report vulnerabilities using the private contact in [`SECURITY.md`](../../SECURITY.md).
