# HKD Semantic Tokens Specification

## 1. Overview

HKD LSP 2.0 provides semantic highlighting via the `textDocument/semanticTokens/full` request. Unlike simple regex-based TextMate grammars, semantic tokens are derived directly from the compiler's parsed Abstract Syntax Tree (`N.Program`).

---

## 2. Token Types & Modifiers

### Token Types Legend:
0. `keyword`: language keywords (`fn`, `let`, `const`, `struct`, `if`, etc.)
1. `variable`: local and global variable identifiers
2. `parameter`: function parameter identifiers
3. `function`: declared function names and method identifiers
4. `struct`: struct type declarations and usages
5. `type`: type annotations (`int`, `float`, `string`, `bool`, etc.)
6. `property`: struct field names and object properties
7. `module`: imported module and package names
8. `string`: string literals
9. `number`: integer and float numeric literals
10. `operator`: binary, unary, and assignment operators

### Token Modifiers:
* `1` (`0x01`): `declaration` — token appears at its definition site
* `2` (`0x02`): `readonly` — token is an immutable constant or binding
* `4` (`0x04`): `defaultLibrary` — token is part of standard library

---

## 3. Wire Encoding

Tokens are encoded as a flat integer array of 5-tuples:
`[deltaLine, deltaStartChar, length, tokenTypeIndex, tokenModifiersBitmask]`
lexicographically ordered by line and start character.
