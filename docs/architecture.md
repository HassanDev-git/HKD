# HKD Architecture Spec

This document details the compiler pipeline, virtual machine execution model, and system architecture of the HKD language environment.

---

## 1. System Topology Overview

The HKD runtime is a stack-based bytecode virtual machine running compiled representation of source files. The flow of execution is depicted below:

```text
       Source File (.hkd)
               │
               ▼ [Lexer]
         Token Stream
               │
               ▼ [Parser]
        Abstract Syntax Tree (AST)
               │
               ▼ [Semantic Analyser]
        Type-Annotated AST
               │
               ▼ [Compiler]
         Bytecode Chunk
               │
               ▼ [Virtual Machine (VM)]
         Execution / Output
```

---

## 2. Compilation Pipeline

### A. Lexical Analysis (`src/lexer/`)
- **Responsibility**: Scans source text character-by-character, ignores whitespaces and comments, tracks line numbers and start/end coordinates (SourceSpan), and matches token kinds.
- **Keywords**: Maps defined keywords like `let`, `const`, `fn`, `struct`, `while`, `for`, `in`, `import`, `export`, etc.
- **Escape Sequences**: Fully supports string escape decoding (e.g. `\n`, `\t`, `\"`, and `\u{HEX}`).

### B. Syntactic Analysis (`src/parser/`)
- **Responsibility**: Implements a hybrid recursive descent and Pratt parser for expressions.
- **Grammar & Precedence**:
  - Handles precedence levels (Pratt parsing) for infix operators (`+`, `-`, `*`, `/`, `%`, `**`, comparisons, boolean operators).
  - Matches structures, block statements, test declarations, variables, and literal arrays/objects.
- **Error Recovery**: Automatically synchronizes parser state to statement boundaries (defined by semicolons, newlines, keywords like `let`, `fn`, `if`, etc.) upon throwing parsing errors, avoiding total aborts on minor syntax issues.

### C. Semantic Analysis (`src/semantic/`)
- **Responsibility**: Implements lexical scoping, symbol declarations, and static type-checking.
- **Scope Model**: Implements linked-list scopes. Variable shadow rules and unused-symbol warning collections are managed here.
- **Type Checking**: Performs compile-time structural equivalence checking for primitive types (`Int`, `Float`, `String`, `Bool`, `Null`, `Any`) and custom `Struct` layouts. Objects (`{}`) are treated as dynamically typed (`Any`) at present.

### E. Bytecode Compiler (`src/bytecode/`)
- **Responsibility**: Translates AST nodes into a sequence of bytecode instructions (`Uint8Array`) and populates the constant pool (`HkdValue[]`).
- **Instruction Format**: Emits 1-byte opcodes followed by optional inline operands (usually big-endian `u16` indexes to locals, upvalues, or constants, or relative jump offsets).

---

## 3. Runtime Engine (Virtual Machine)

### A. Stack Model
- **Value Stack**: Stores primitive values (`number`, `string`, `boolean`, `null`), and reference values (`HkdArray`, `HkdObject`, `HkdFunction`, `HkdClosure`, `HkdNativeFunction`).
- **Call Stack**: Managed using a series of `CallFrame` blocks tracking execution frame pointers, local variables base indexes, instruction pointers (IP), and closure references.

### B. Opcode Interpreter (`src/vm/`)
- **Loop**: Continuously decodes `Op` codes and dispatches them via a `switch` instruction.
- **Closures**: Uses upvalues to represent nested variables, tracking them inside open/closed state ranges.
- **Built-in / Native Hooks**: Directly maps Node.js functions (e.g., standard IO, array operations, or fs operations) into native callable values (`HkdNativeFunction`).

---

## 4. Standard Library (`src/stdlib/`)

Stdlib modules are map tables bound into the VM globally through `__import__` native bindings:
- `math` / `std.math`: Wraps `Math` properties.
- `string` / `std.string`: Exposes casing operations, lengths, joins, and splittings.
- `array` / `std.array`: Operations for concats, pushes, pops, sorts, and ranges.
- `io` / `std.io`: Print, error prints, and read stubs.
- `time` / `std.time`: Epoch times and sleeps.
- `fs` / `std.fs`: Raw file reading, writing, appending, and folder listings.
- `json` / `std.json`: Serialization and parsing.
- `path` / `std.path`: Path manipulations.
