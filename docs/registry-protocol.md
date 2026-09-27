# HKD Package Registry Protocol Specification (V1)

## 1. Overview & Scope

The HKD Package Ecosystem operates on a deterministic, content-addressed foundation.

### Scope Classification
* **Production-Certified**: Local path dependencies, content-addressed package cache (`~/.hkd/cache/`), `.hkdpack` gzipped tarball archives, offline installation, and lockfile validation (`hkd.lock` v2).
* **Experimental / Reference Protocol**: Remote HTTP registry client and public registry endpoint (`https://registry.hkdlang.org/api/v1`).

This document defines the formal HTTP protocol specification for HKD v1 package registries, suitable for self-hosted enterprise mirrors, third-party package indexes, and automated CI publishing pipelines.

---

## 2. Transport & Security Requirements

1. **Transport Layer Security (TLS)**:
   * Production registries **MUST** require TLS 1.2 or TLS 1.3 over HTTPS.
   * Cleartext HTTP is explicitly forbidden except when resolving `localhost` or `127.0.0.1` during local unit and integration testing.
2. **Payload Encodings**:
   * API request and response bodies MUST use `application/json` (UTF-8 encoded).
   * Package artifact payloads MUST use `application/octet-stream` or `application/x-hkdpack`.
3. **Checksum Enforcement**:
   * All published and retrieved package archives MUST be verified against their declared SHA-256 integrity hash (`sha256:<hex64>`).
   * Any client downloading a package archive MUST compute the SHA-256 digest of the downloaded payload before writing to the local cache or executing code. Mismatches MUST immediately abort with `ErrorCode.E603`.

---

## 3. Authentication & Authorization

Clients authenticate using Bearer tokens passed in the `Authorization` header:

```http
Authorization: Bearer <token>
```

Tokens are loaded in the following priority order:
1. `--token <token>` command-line flag.
2. `HKD_AUTH_TOKEN` environment variable.
3. `~/.hkd/credentials.toml` registry credential file:

```toml
[registries."https://registry.hkdlang.org"]
token = "hkd_sec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### Token Scopes
* `package:read`: Fetch metadata and download package archives.
* `package:publish`: Publish new releases for owned namespaces.
* `package:deprecate`: Deprecate or unpublish releases.

---

## 4. REST API Endpoints

### 4.1. Package Metadata (`GET /api/v1/packages/:name`)

Fetches all published versions, deprecation status, and latest release pointer for a package.

#### Request
```http
GET /api/v1/packages/math-extra HTTP/1.1
Host: registry.hkdlang.org
Accept: application/json
```

#### Response `200 OK`
```json
{
  "name": "math-extra",
  "description": "Mathematical utility functions for HKD",
  "latest": "1.2.0",
  "versions": {
    "1.0.0": {
      "version": "1.0.0",
      "edition": "2026",
      "description": "Mathematical utility functions for HKD",
      "license": "MIT",
      "checksum": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "dependencies": {},
      "published_at": "2026-09-01T12:00:00Z",
      "deprecated": false
    },
    "1.2.0": {
      "version": "1.2.0",
      "edition": "2026",
      "description": "Mathematical utility functions for HKD",
      "license": "MIT",
      "checksum": "sha256:a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
      "dependencies": {},
      "published_at": "2026-09-03T18:30:00Z",
      "deprecated": false
    }
  }
}
```

---

### 4.2. Version Metadata (`GET /api/v1/packages/:name/:version`)

Fetches specific version details.

#### Request
```http
GET /api/v1/packages/math-extra/1.0.0 HTTP/1.1
Host: registry.hkdlang.org
Accept: application/json
```

#### Response `200 OK`
```json
{
  "name": "math-extra",
  "version": "1.0.0",
  "edition": "2026",
  "description": "Mathematical utility functions for HKD",
  "license": "MIT",
  "checksum": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "download_url": "https://registry.hkdlang.org/api/v1/packages/math-extra/1.0.0/download",
  "dependencies": {},
  "devDependencies": {},
  "published_at": "2026-09-01T12:00:00Z",
  "deprecated": false
}
```

---

### 4.3. Download Package Archive (`GET /api/v1/packages/:name/:version/download`)

Downloads the raw `.hkdpack` package tarball.

#### Request
```http
GET /api/v1/packages/math-extra/1.0.0/download HTTP/1.1
Host: registry.hkdlang.org
```

#### Response `200 OK`
```http
HTTP/1.1 200 OK
Content-Type: application/x-hkdpack
Content-Length: 1024
ETag: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
Cache-Control: public, max-age=31536000, immutable

<binary .hkdpack data>
```

---

### 4.4. Publish Package Version (`PUT /api/v1/packages/:name/:version`)

Publishes a new package release. Requires Bearer authentication.

#### Request
```http
PUT /api/v1/packages/math-extra/1.0.0 HTTP/1.1
Host: registry.hkdlang.org
Authorization: Bearer hkd_sec_exampletoken
Content-Type: multipart/form-data; boundary=----HKDBoundary

------HKDBoundary
Content-Disposition: form-data; name="manifest"
Content-Type: application/json

{
  "name": "math-extra",
  "version": "1.0.0",
  "edition": "2026",
  "description": "Mathematical utility functions for HKD",
  "license": "MIT",
  "checksum": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
------HKDBoundary
Content-Disposition: form-data; name="archive"; filename="math-extra-1.0.0.hkdpack"
Content-Type: application/x-hkdpack

<binary .hkdpack data>
------HKDBoundary--
```

#### Response `201 Created`
```json
{
  "ok": true,
  "package": "math-extra",
  "version": "1.0.0",
  "checksum": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "message": "Package published successfully"
}
```

---

### 4.5. Deprecate Version (`POST /api/v1/packages/:name/:version/deprecate`)

Marks a package version as deprecated without breaking existing locked builds.

#### Request
```http
POST /api/v1/packages/math-extra/1.0.0/deprecate HTTP/1.1
Host: registry.hkdlang.org
Authorization: Bearer hkd_sec_exampletoken
Content-Type: application/json

{
  "reason": "Please upgrade to >=1.2.0 due to performance optimizations"
}
```

#### Response `200 OK`
```json
{
  "ok": true,
  "package": "math-extra",
  "version": "1.0.0",
  "deprecated": true,
  "reason": "Please upgrade to >=1.2.0 due to performance optimizations"
}
```

---

## 5. Rate Limiting & Error Codes

Registries should enforce rate limiting per authenticated token or client IP:
* `X-RateLimit-Limit`: Maximum requests per rolling window (e.g. 1000).
* `X-RateLimit-Remaining`: Remaining request allowance.
* `X-RateLimit-Reset`: Unix epoch seconds until window resets.

### Error Envelope
When an error occurs, the server MUST return an HTTP status code matching the failure (400, 401, 403, 404, 409, 429, 500) and a structured JSON body:

```json
{
  "error": true,
  "code": "E601",
  "message": "Package 'math-extra@1.0.0' has already been published and cannot be overwritten."
}
```

---

## 6. Self-Hosting & Offline Enterprise Mirrors

Enterprise environments with strict air-gapped security can mirror HKD packages by:
1. Syncing `.hkdpack` archives and metadata JSON trees to an S3/GCS bucket or local HTTP server.
2. Setting the registry URL in project manifests or environment:
   ```bash
   export HKD_REGISTRY_URL="https://packages.internal.company.com/api/v1"
   ```
3. Or using local vendor directories (`hkd vendor`) and local paths (`path: ...`), avoiding all network calls.
