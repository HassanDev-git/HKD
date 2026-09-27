# HKD Language Audit - Phase 7.0

This document contains a comprehensive audit of the HKD programming language, separating features into **IMPLEMENTED**, **PARTIALLY IMPLEMENTED**, and **PLANNED**.

---

## 1. Syntax & Core Language Features

### Syntax
* **Currently Supported**: C-style / Rust-style syntax (block-scoped declarations, braces `{}` for loops/conditionals, semi-colon optional).
* **Classification**: **IMPLEMENTED**.

### Types
* **Static/Gradual Types**: Supports annotations like `let x: Int = 10`.
* **Basic Types**: `Int`, `Float`, `Bool`, `String`, `Array`, `Object`, `Null`.
* **Nullable Types**: `Type?` syntax for nullable wrappers.
* **Classification**: **IMPLEMENTED** (Type checking occurs during the Semantic Analysis pass in JS/TS).

### Operators
* **Arithmetic**: `+`, `-`, `*`, `/`, `%`, `**` (exponentiation).
* **Comparison**: `==`, `!=`, `<`, `<=`, `>`, `>=`.
* **Logical**: `&&`, `||`, `!`.
* **Bitwise**: `&`, `|`, `^`, `~`, `<<`, `>>`.
* **Assignment**: `=`, `+=`, `-=`, `*=`, `/=`, `%=`.
* **Classification**: **IMPLEMENTED**.

### Functions & Closures
* **Syntax**: `fn name(params) -> Type { body }` and anonymous `fn(params) { body }`.
* **Lexical Scope & Closures**: Nested functions capturing variables. The compiler generates upvalue descriptors, and the VMs compile them into active `Closure` / `Upvalue` heap objects.
* **Classification**: **IMPLEMENTED**.

### Structs
* **Syntax**: `struct Name { field: Type }`.
* **Initialization**: `Name { field: value }`.
* **Classification**: **IMPLEMENTED** (Desugars to Object literal with `__type__` set to struct name).

### Arrays & Objects
* **Syntax**: `[1, 2, 3]` and `{ "key": value }`.
* **Access**: Indexing `arr[i]` and field read/write `obj.field` / `obj["key"]`.
* **Classification**: **IMPLEMENTED**.

### Modules & Imports
* **Imports**: `import math`, `import { add } from "math"`, `import default_name from "path"`.
* **Exports**: `export let x = 1`, `export fn f() {}`.
* **Resolution**: Local filesystem paths resolved relative to caller, and climbing parent directories to resolve `.hkd/deps/<pkg>`.
* **Context**: Isolated VM context per module, merging exports into the parent context.
* **Classification**: **IMPLEMENTED**.

### Control Flow
* **If/Else**: `if cond { ... } else { ... }`. Also works as expression.
* **While Loops**: `while cond { ... }`.
* **For Loops**: `for item in iterable { ... }` (utilizes iterator protocols).
* **Break / Continue**: `break` and `continue` statement compilation.
* **Classification**: **IMPLEMENTED**.

### Error Handling
* **VM Panics**: `panic("msg")` natively exits with error messages.
* **Assertions**: `assert(cond, msg)` and `assert(cond)`.
* **Classification**: **IMPLEMENTED**.

---

## 2. Standard Library

* **Math**: `math.abs`, `math.floor`, `math.ceil`, `math.sqrt`, `math.sin`, `math.cos`. (**IMPLEMENTED**)
* **String**: `str.len`, `str.to_upper`, `str.to_lower`, `str.split`, `str.replace`. (**IMPLEMENTED**)
* **Array**: `arr.push`, `arr.pop`, `arr.len`. (**IMPLEMENTED**)
* **JSON**: `json.parse`, `json.stringify`. (**PARTIALLY IMPLEMENTED**)
* **Path**: Native path manipulation. (**PLANNED**)
* **FS**: `fs.read_file`, `fs.write_file`, `fs.exists`. (**IMPLEMENTED**)
* **Process / Environment**: `env.get`, `env.set`. (**PLANNED**)

---

## 3. Tooling & Ecosystem

* **CLI**: `run`, `build`, `check`, `test`, `fmt`, `lint`, `init`, `add`, `remove`, `install`, `update`, `doc`. (**IMPLEMENTED**)
* **Package Manager**: Offline packing/unpacking `.hkdpack` archives, local lockfile `hkd.lock` management, traversal protection. (**IMPLEMENTED**)
* **Bytecode VM**: Zero-leak reference VM (TypeScript) and optimized native VM (Zig) running on `.hkdb` binary bytecode. (**IMPLEMENTED**)
* **LSP Server**: Provides Hovers, Go to Definition, Diagnostics sync. (**PARTIALLY IMPLEMENTED**)
* **Formatter**: Safe source code formatter. (**IMPLEMENTED**)
* **Linter**: Lints code style and basic correctness warnings. (**IMPLEMENTED**)
* **Test Runner**: Runs `test` blocks registered dynamically. (**IMPLEMENTED**)
