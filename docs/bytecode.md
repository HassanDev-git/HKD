# HKD Bytecode Format Specification (.hkdb)

This document formally specifies the binary format of HKD bytecode compiled programs and modules.

---

## 1. Header (8 Bytes)

Every valid `.hkdb` file must start with a contiguous 8-byte header:

```text
Offset | Type | Description
-------|------|---------------------------------------------------------
0 - 3  | char | Magic bytes. Must be exactly 'HKDB' in ASCII.
4      | u8   | Bytecode format version (e.g. 1).
5      | u8   | Language major version.
6      | u8   | Language minor version.
7      | u8   | Runtime ABI version.
```

The runtime must validate these bytes and cleanly reject incompatible versions.

---

## 2. Bytecode Chunk Structure

Directly following the header is the main serialized Function chunk. Chunks are serialized recursively:

```text
Field             | Type   | Description
------------------|--------|--------------------------------------------
name_len          | u16    | Length of the function name in bytes.
name              | string | UTF-8 encoded function name.
arity             | u8     | Expected number of arguments.
local_count       | u16    | Maximum local variables slots needed.
upvalue_count     | u16    | Number of upvalues captured by this function.
code_len          | u32    | Length of bytecode instructions block.
code_bytes        | binary | Array of u8 opcode and operand bytes.
lines_len         | u32    | Length of line information mapping.
line_numbers      | u16[]  | Line number mapping matching code offset.
constants_count   | u16    | Number of entries in the constant table.
constants_table   | entry[]| Array of tagged constants.
```

---

## 3. Constant Entry Tags

Entries in the `constants_table` have a 1-byte type tag:

```text
Tag  | Type     | Description
-----|----------|-------------------------------------------------------
0x00 | Null     | The null value constant.
0x01 | False    | Boolean false constant.
0x02 | True     | Boolean true constant.
0x03 | Number   | f64 double-precision floating-point number.
0x04 | String   | Length-prefixed (u16) UTF-8 string value.
0x05 | Function | Recursive Bytecode Chunk definition for nested functions.
```
