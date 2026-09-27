# HKD Migration Guide: Upgrading from 1.0 (Edition 2026) to 1.1 (Edition 2027)

This document provides step-by-step guidance for upgrading projects from HKD 1.0 (Edition 2026) to HKD 1.1 (Edition 2027).

---

## 1. Backwards Compatibility Guarantees

HKD guarantees that **valid Edition 2026 code will continue to compile and run without modification under HKD 1.1.0**.

By default, every project without an explicit `edition` declared in `hkd.toml` is interpreted as **Edition 2026**.

Existing `hkd.lock` files from HKD 1.0 (Lockfile V1 JSON format) are automatically and transparently migrated to Lockfile V2 TOML format upon the first `hkd install`, `hkd update`, or `hkd build` operation.

---

## 2. Upgrading to Edition 2027

To enable Edition 2027 features:

1. Open your project's `hkd.toml`.
2. Update or add the `edition` field under `[package]`:
   ```toml
   [package]
   name = "my-application"
   version = "1.1.0"
   edition = "2027"
   ```
3. Run verification:
   ```bash
   hkd check
   hkd test
   ```

---

## 3. New Features Unlocked in Edition 2027

### A. Generics
Define reusable structs and functions parameterized by type:
```hkd
struct Box<T> {
    item: T
}

fn wrap<T>(val: T) -> Box<T> {
    return Box { item: val }
}
```

### B. Pattern Matching
Perform exhaustive pattern matching with destructuring and wildcards:
```hkd
match response_code {
    200 => println("OK"),
    404 => println("Not Found"),
    _ => println("Other status")
}
```

### C. Async / Await (RFC-004)
Deterministic asynchronous execution model with task scheduling:
```hkd
async fn fetch_data(id: Int) -> String {
    let result = await api.query(id)
    return result
}
```

### D. Standard Library 1.1 Additions
New functional combinators and iterators:
- `array.find(arr, pred)`
- `array.every(arr, pred)`
- `array.some(arr, pred)`
- `array.zip(a, b)`
- `array.enumerate(arr)`
- `result.ok(val)` and `result.err(e)`

---

## 4. Lockfile V1 to V2 Migration

HKD Lockfile V2 replaces JSON with clean, git-merge-friendly TOML:
- Individual entries under `[[package]]`
- Cryptographic SHA-256 source pinning (`checksum = "sha256:..."`)
- Normalized forward-slash relative path recording
- Deterministic lexicographical sorting across all platforms

Migration is completely automatic; running any package manager command updates `hkd.lock` without manual intervention.
