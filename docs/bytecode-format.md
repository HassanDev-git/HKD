# HKD Bytecode Format Specification (.hkdb)

## 1. File Layout Overview
An `.hkdb` compiled bytecode file is encoded in little-endian binary format:

```
┌───────────────────────────────────────────────────────────┐
│ Magic Header (4 bytes): 0x48 0x4B 0x44 0x42 ("HKDB")     │
├───────────────────────────────────────────────────────────┤
│ Format Version (2 bytes): u16 (e.g. 1)                    │
├───────────────────────────────────────────────────────────┤
│ Target Architecture (2 bytes): u16 enum                   │
├───────────────────────────────────────────────────────────┤
│ Constant Pool Count (4 bytes): u32                        │
├───────────────────────────────────────────────────────────┤
│ Constant Pool Entries (variable length)                   │
├───────────────────────────────────────────────────────────┤
│ Instruction Stream Byte Count (4 bytes): u32              │
├───────────────────────────────────────────────────────────┤
│ Bytecode Instruction Stream (opcodes + operands)          │
├───────────────────────────────────────────────────────────┤
│ Source Map & Debug Line Information                       │
└───────────────────────────────────────────────────────────┘
```

---

## 2. Constant Pool Encoding
Each constant entry begins with a 1-byte type tag:
- `0x00`: Null
- `0x01`: Boolean (1 byte: `0` or `1`)
- `0x02`: 64-bit Integer (`i64` little-endian)
- `0x03`: 64-bit Float (`f64` little-endian IEEE 754)
- `0x04`: String (u32 length prefix + raw UTF-8 bytes)
- `0x05`: Function Chunk (recursive chunk structure)

---

## 3. Instruction Encoding
Instructions consist of an 8-bit `OpCode` followed by 0, 1, or 2 operand bytes:
- 0-operand instructions: e.g. `Op.Add`, `Op.Sub`, `Op.Pop`, `Op.Return`.
- 16-bit operand instructions: e.g. `Op.LoadConst <u16>`, `Op.LoadGlobal <u16>`, `Op.StoreGlobal <u16>`.
- Jump instructions: e.g. `Op.Jump <i16 offset>`, `Op.JumpFalse <i16 offset>`.
- Call instructions: `Op.Call <u8 argc>`.
