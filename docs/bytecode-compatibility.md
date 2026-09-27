# HKD Bytecode Compatibility Policy

## 1. Versioning & Verification
1. Every `.hkdb` binary contains a format version field in its header.
2. The runtime verifies this version before executing a single instruction.
3. If the bytecode version is higher than the runtime's supported maximum, the runtime halts with diagnostic error:
   ```
   Incompatible bytecode version: found vX, max supported vY. Please upgrade your HKD runtime.
   ```
4. If magic bytes do not equal `0x48 0x4B 0x44 0x42` ("HKDB"), the runtime halts with:
   ```
   Corrupt or invalid bytecode header.
   ```

---

## 2. Invariant Safety
- The runtime verifies jump offsets to ensure no jump can target an address outside the bounds of the chunk.
- Constant pool indices are checked against constant pool bounds.
- Stack underflow / overflow guards prevent execution of malformed bytecode.
