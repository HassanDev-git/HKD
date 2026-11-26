# Build Provenance and Release Signing

This document states the current repository boundary. CI runs build and verification jobs, but this project does not currently publish signed release packages or generate an in-toto/SLSA build attestation. No signing key, HSM custody, signature, or provenance level is claimed.

The CI workflow uploads machine-readable execution evidence and container logs as workflow artifacts. These record the workflow revision, runner, tool versions, and outcomes; they are not cryptographic attestations.

To verify a future release, maintainers should publish a manifest containing the source commit, target, toolchain versions, artifact names, and SHA-256 checksums, then sign the manifest using a separately reviewed signing process. Until that process is implemented and its artifacts are published, consumers should treat source builds as un-signed.
