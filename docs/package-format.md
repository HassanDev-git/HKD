# HKD Package Archive Format 2.0 (.hkdpack)

## 1. Specification Overview

The HKD Package Archive 2.0 (`.hkdpack`) is a binary, deterministic container designed for distributing HKD packages. It eliminates non-deterministic host metadata (timestamps, file modes, user IDs, path separators) to guarantee bit-for-bit reproducible packaging.

---

## 2. Binary Layout

```text
+-------------------------------------------------------------+
| Magic Header: "HKDPACK2\n" (9 bytes)                        |
+-------------------------------------------------------------+
| Manifest Length: u32 big-endian                             |
+-------------------------------------------------------------+
| Manifest Body: UTF-8 JSON (keys sorted lexicographically)   |
+-------------------------------------------------------------+
| File Count: u32 big-endian                                  |
+-------------------------------------------------------------+
| [File Entry 0]                                              |
|   - Path Length: u32 big-endian                             |
|   - Relative Path: UTF-8 (forward slashes, sorted)          |
|   - Content Length: u32 big-endian                          |
|   - Content Bytes: raw data                                 |
+-------------------------------------------------------------+
| [File Entry 1] ...                                          |
+-------------------------------------------------------------+
| [File Entry N-1]                                            |
+-------------------------------------------------------------+
```

---

## 3. Determinism Rules

1. **Path Normalization**: All paths MUST use POSIX forward slash (`/`) delimiters. Windows backslashes (`\`) are converted prior to serialization.
2. **Lexicographical Sorting**: File entries MUST be sorted by their relative path in ascending byte order.
3. **Excluded Artifacts**: Packagers MUST exclude `node_modules`, `.git`, `target`, `.hkd`, `vendor`, and `.hkdpack` files.
4. **Metadata Stripping**: No filesystem modification times, creation dates, or POSIX permissions are stored.

---

## 4. Decompression Limits & Bomb Defense

To prevent denial-of-service and filesystem exhaustion attacks, unpackers enforce the following hard limits:

* **Max Files**: 5,000 files per archive.
* **Max Total Extracted Size**: 50 MB uncompressed.
* **Max Path Length**: 260 characters.
* **Max Directory Nesting Depth**: 16 levels.
* **Path Traversal**: Any entry containing `..`, leading `/`, leading `\`, or absolute drive prefixes is rejected with `error[SEC005]`.
