# HKD Cryptographic Signing, Provenance & Release Integrity Specification

This document defines the cryptographic signing architecture, provenance attestation model, key management policy, and verification workflows for all official HKD releases (beginning with **HKD 1.1.0**).

---

## 1. Overview & Trust Model

Official HKD releases follow an **SLSA (Supply-chain Levels for Software Artifacts) Build Level 3 provenance architecture**. Every official binary, distribution archive, container image, and package artifact is bound to:
1. An immutable cryptographic digest (SHA-256).
2. A non-repudiable digital signature generated via Minisign or Cosign (Sigstore keyless OIDC).
3. A machine-verifiable in-toto provenance attestation recording build inputs, environment hashes, and build execution steps.

```
       Source Commit (Git SHA-512)
                   │
                   ▼
       Isolated GitHub Actions Runner (OIDC Token)
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│               Hermetic Release Pipeline                │
│  - npm run build                                       │
│  - npx tsc --noEmit                                    │
│  - npx esbuild / Node SEA Blob Generation              │
│  - SHA-256 Hashing across Target Triples               │
└────────────────────────────────────────────────────────┘
                   │
      ┌────────────┼────────────┐
      ▼            ▼            ▼
 [Binaries]   [Checksums]  [Attestations]
   *.exe /      SHA256SUMS   artifacts.json
   tar.gz                    *.intoto.jsonl
      │            │            │
      └────────────┼────────────┘
                   ▼
         Cosign / Minisign Signing
                   │
                   ▼
      Public Release Distribution & Verification
```

---

## 2. Release Artifacts Architecture

Each release generates an authoritative manifest (`dist/artifacts.json`) alongside canonical checksum files (`dist/SHA256SUMS`).

### 2.1 Supported Distribution Triples

| Target Triple | Distribution Format | Executable Name | Tier Status |
|---|---|---|---|
| `x86_64-pc-windows-msvc` | `.zip` / Single Executable | `hkd.exe` | Tier 1 (Supported) |
| `x86_64-unknown-linux-gnu` | `.tar.gz` / Single Executable | `hkd` | Tier 1 (Supported) |
| `x86_64-unknown-linux-musl` | `.tar.gz` / Static Binary | `hkd` | Tier 1 (Supported) |
| `aarch64-unknown-linux-gnu` | `.tar.gz` / Single Executable | `hkd` | Tier 2 (Experimental) |
| `aarch64-apple-darwin` | `.tar.gz` / Universal Binary | `hkd` | Tier 2 (Experimental) |

### 2.2 Release Manifest Schema (`artifacts.json`)

The manifest captures metadata for every binary produced:
```json
{
  "release": "1.1.0",
  "publishedAt": "2026-09-04T18:30:00.000Z",
  "compilerVersion": "1.1.0",
  "edition": "2026",
  "artifacts": [
    {
      "name": "hkd-1.1.0-x86_64-windows.zip",
      "target": "x86_64-windows",
      "architecture": "x86_64",
      "os": "windows",
      "sha256": "<64-hex-digest>",
      "sizeBytes": 93191680,
      "signature": "hkd-1.1.0-x86_64-windows.zip.minisig"
    }
  ]
}
```

---

## 3. Cryptographic Signing Mechanisms

HKD uses a dual signing strategy to guarantee both modern keyless infrastructure transparency and offline, air-gapped cryptographic validation.

### 3.1 Keyless Signing via Cosign & Sigstore (Primary)
- CI release runners authenticate against Sigstore using GitHub Actions OpenID Connect (OIDC).
- Signatures and certificate transparency log proofs are recorded in the public **Rekor** transparency ledger.
- Verification requires no long-lived secret management in CI.

```bash
# Verify release tarball using Cosign keyless workflow
cosign verify-blob \
  --certificate-identity https://github.com/HassanDev-git/HKD/.github/workflows/release.yml@refs/tags/v1.1.0 \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --signature dist/releases/hkd-1.1.0-x86_64-windows.zip.sig \
  --certificate dist/releases/hkd-1.1.0-x86_64-windows.zip.pem \
  dist/releases/hkd-1.1.0-x86_64-windows.zip
```

### 3.2 Minisign Offline Signatures (Secondary / Redundant)
- For air-gapped systems or environments without internet access to Sigstore Rekor, releases provide Minisign signatures (`.minisig`).
- Public Key: `RWTx7bF9z0K...[Official HKD Release Public Key]`

```bash
# Verify checksums using Minisign
minisign -Vm dist/SHA256SUMS -p hkd-release.pub
```

---

## 4. In-Toto Provenance Attestation (SLSA Level 3)

The build produces an in-toto attestation (`dist/provenance.intoto.jsonl`) recording:
- **Builder Identity**: GitHub Hosted Ubuntu/Windows Runner (`https://github.com/actions/runner`).
- **Source Repository**: `https://github.com/HassanDev-git/HKD`.
- **Source Revision**: Exact Git commit SHA-512.
- **Build Invocation**: `npm run build`, Node SEA injection flags, and TypeScript compiler options.
- **Reproducibility Digest**: Invariant hashes of input dependencies resolved via `package-lock.json` and `Cargo.lock` / `build.zig.zon`.

---

## 5. Key Management & Rotation Policy

### 5.1 Key Roles & Storage
1. **Root Release Key (Offline / Air-Gapped)**:
   - Stored on FIPS 140-2 Level 3 Hardware Security Modules (YubiKey 5 Series).
   - Requires physical multi-party presence (2-of-3 maintainer quorum) for access.
   - Used solely to sign intermediate release keys and certificate revocation lists.
2. **Intermediate Release Signing Keys**:
   - Stored in encrypted cloud HSMs with strict role-based access control (RBAC).
   - Restricted to release branch tagging events.

### 5.2 Key Rotation Lifecycle
- **Quarterly Audit (90 Days)**: Maintainers verify signature transparency logs, key usage metrics, and physical HSM custody.
- **Annual Key Rotation (365 Days)**: Intermediate release signing keys are rotated annually. The previous year's public key is archived in `docs/security/keys/` and marked expired.
- **Emergency Revocation**: In the event of a suspected compromise:
  1. Revocation notices are immediately published to `SECURITY.md`, GitHub Security Advisories, and the DNS TXT record of `hkd-lang.dev`.
  2. The compromised key ID is added to `src/deploy/revoked_keys.json`.
  3. `hkd verify-release` and `hkd doctor` flag the key as revoked upon network update.

---

## 6. End-User & CI Verification Procedures

### 6.1 Checksum Integrity
```bash
# On Linux / macOS:
sha256sum -c dist/SHA256SUMS

# On Windows (PowerShell):
Get-FileHash -Algorithm SHA256 dist/releases/windows-x64/hkd.exe
```

### 6.2 Automated Tooling Verification
HKD provides automated verification built directly into the CLI:
```bash
# Verify local release bundle integrity and checksums
hkd verify-release

# Generate machine-readable JSON acceptance report
hkd verify-release --json > release-report.json
```
