# HKD Phase 18 Architecture Audit

**Target Baseline**: HKD 1.0.0 (Edition 2026)  
**Maintenance Branch**: `release/1.0`  
**Evolution Target**: HKD 1.1 Platform (Edition 2027 & Feature Gating)  
**Audit Date**: September 2026  

---

## 1. Current Compiler Pipeline

The HKD reference compiler is structured as a classical, clean multi-stage pipeline implemented in TypeScript (`src/`):

```text
Source Code (.hkd)
       │
       ▼
 [ Lexer ] (src/lexer/lexer.ts)
   - Converts raw UTF-8 into typed Token stream
   - Automatic Semicolon Insertion (ASI) via newline handling
   - Precise source spans (file, line, column, byte offset)
       │
       ▼
 [ Parser ] (src/parser/parser.ts)
   - Top-Down Operator Precedence (Pratt parsing) for expressions
   - Recursive descent for statements and declarations
   - Error recovery with synchronization tokens
       │
       ▼
 [ Abstract Syntax Tree (AST) ] (src/ast/nodes.ts)
   - Discriminated union of AST nodes (`kind` literal)
   - Type annotations represented as `TypeExpr`
       │
       ▼
 [ Semantic Analyser ] (src/semantic/analyser.ts)
   - Scoped symbol resolution (`Scope` hierarchy)
   - Type inference & static type checking (`HkdType`)
   - Constraint validation (immutability, return paths, dead code)
       │
       ▼
 [ High-Level IR (HIR) ] (src/ir/hir.ts)
   - Canonical desugaring (loops, complex expressions)
       │
       ▼
 [ Mid-Level SSA IR (MIR) ] (src/ir/mir.ts)
   - SSA form with basic blocks and phi nodes
   - Optimizations (Constant folding, DCE, CSE, Inlining) in `src/ir/optimizer.ts`
       │
       ▼
 [ Bytecode Compiler ] (src/bytecode/compiler.ts)
   - Lowers AST/IR to stack VM bytecode
   - Emits Chunks containing bytecode, constants, lines, and local slot layouts
       │
       ▼
 [ Serialization ] (src/bytecode/serializer.ts)
   - Encodes chunks into binary `.hkdb` (HKDB V2 format)
```

---

## 2. Execution Tiers

HKD supports 5 distinct execution engines:

1. **Stack Virtual Machine** (`src/vm/vm.ts`):
   - Reference stack-based bytecode interpreter.
   - Handles closures, upvalues, arrays, structs, and native runtime bindings.
2. **Native Zig Runtime** (`native-runtime/src/`):
   - Standalone native binary runtime (`hkd-runtime.exe` / `hkd-runtime`).
   - Native garbage collection, memory pools, tagged union values, and standard library bindings.
3. **Baseline JIT**:
   - Fast machine code template generator for hot loops and functions.
4. **Optimizing JIT**:
   - Register-allocated machine code with inline caches and escape analysis.
5. **Native AOT**:
   - Ahead-of-time standalone compilation embedding bytecode and native runtime into single executables (`hkd build --release --target native`).

---

## 3. Current AST Model

Defined in `src/ast/nodes.ts`:
* **Base Node**: `AstNode { span: SourceSpan }`
* **Type Expressions (`TypeExpr`)**: `NamedTypeExpr`, `ArrayTypeExpr`, `FunctionTypeExpr`, `NullableTypeExpr`.
* **Literals**: `IntLiteral`, `FloatLiteral`, `StringLiteral`, `BoolLiteral`, `NullLiteral`.
* **Expressions (`Expr`)**: `IdentExpr`, `BinaryExpr`, `UnaryExpr`, `CallExpr`, `IndexExpr`, `MemberExpr`, `AssignExpr`, `CompoundAssignExpr`, `ArrayExpr`, `ObjectExpr`, `FunctionExpr`, `IfExpr`, `BlockExpr`, `StructInitExpr`, `RangeExpr`, `CastExpr`.
* **Statements (`Stmt`)**: `VarDeclStmt`, `ConstDeclStmt`, `FunctionDeclStmt`, `StructDeclStmt`, `TypeAliasStmt`, `ReturnStmt`, `BreakStmt`, `ContinueStmt`, `IfStmt`, `WhileStmt`, `ForStmt`, `BlockStmt`, `ExprStmt`, `ImportStmt`, `ExportStmt`, `TestStmt`, `AssertStmt`.

### Phase 18 Extension Points
* Introduce `MatchExpr` / `MatchArm` / `Pattern` for pattern matching.
* Add `typeParameters: TypeParam[]` to `FunctionDeclStmt` and `CallExpr` for generics.
* Introduce `#feature(...)` compiler directive node.

---

## 4. Current Semantic Model & Type System

Defined in `src/semantic/types.ts` & `src/semantic/analyser.ts`:
* **Types (`HkdType`)**:
  - `PrimitiveType`: `Int`, `Float`, `String`, `Bool`, `Null`
  - `ArrayType`: `[T]`
  - `FunctionType`: `(T1, T2) -> R`
  - `StructType`: Named record with typed fields
  - `NullableType`: `T?`
  - Special types: `Unknown`, `Never`, `Any`
* **Subtyping & Assignability**:
  - Nullability check: `T` assignable to `T?`
  - Strict primitive equality (no silent coercion)
* **Scope Hierarchy**:
  - Block scopes, function scopes, global scope
  - Lexical closures tracked with upvalue capture flags

### Phase 18 Extension Points
* Introduce `GenericType`, `TypeParameterType`, and `ResultType`.
* Type substitution engine for generic instantiation.
* Pattern exhaustiveness and reachability validation.

---

## 5. Bytecode ISA & Chunk Format

Defined in `src/bytecode/opcodes.ts` & `src/bytecode/chunk.ts`:
* 1-byte opcodes (0x01–0x72), 2-byte big-endian operands.
* **Stack**: `LoadConst`, `LoadNull`, `LoadTrue`, `LoadFalse`, `Pop`, `Dup`.
* **Variables**: `LoadLocal`, `StoreLocal`, `DefineLocal`, `LoadGlobal`, `StoreGlobal`, `DefineGlobal`.
* **Closures**: `LoadUpvalue`, `StoreUpvalue`, `CloseUpvalue`, `MakeClosure`.
* **Math & Bitwise**: `Add`, `Sub`, `Mul`, `Div`, `Mod`, `Pow`, `Neg`, `BitAnd`, `BitOr`, `BitXor`, `BitNot`, `Shl`, `Shr`.
* **Comparison & Logic**: `Eq`, `Ne`, `Lt`, `Le`, `Gt`, `Ge`, `Not`.
* **Control Flow**: `Jump`, `JumpFalse`, `JumpTrue`, `JumpNull`, `Call`, `Return`.
* **Collections**: `MakeArray`, `GetIndex`, `SetIndex`.
* **Serialization**: Magic header `HKDB\x02` (Version 2).

---

## 6. Standard Library Architecture

Defined in `src/stdlib/index.ts` & `native-runtime/src/stdlib.zig`:
* Plain modules injected via `__import__` hook.
* Modules:
  - `math` / `std.math`: Math constants, trigonometry, logarithms, power.
  - `string` / `std.string`: String manipulation, casing, slicing, search.
  - `array` / `std.array`: Array push, pop, slice, join, concat.
  - `io` / `std.io`: Standard I/O primitives.
  - `time` / `std.time`: Timestamps and intervals.
  - `fs` / `std.fs`: File system reading, writing, directories.
  - `json` / `std.json`: JSON serialization and parsing.
  - `path` / `std.path`: Path normalization and joins.
  - `env` / `std.env`: Environment variables and CLI arguments.
  - `http` / `std.http`: HTTP client, server, and metrics.
  - `process` / `std.process`: Child process spawning.
  - `buffer` / `std.buffer`: Raw byte buffers.
  - `task` / `std.task`: Asynchronous task scheduling and sleep.

---

## 7. Package Ecosystem & Registries

Implemented in `src/package-manager/`:
* Manifest: `hkd.toml` with `name`, `version`, `edition`, `dependencies`.
* Lockfile: `hkd.lock` (V2 format) with deterministic dependency trees and SHA-256 integrity digests.
* Archives: `.hkdpack` 2.0 gzipped tarball format with bomb protection.
* Caches: Content-addressed store at `~/.hkd/cache/`.
* Workspaces: Multi-package repository orchestration.
* Audit Engine: `src/package-manager/audit.ts` with checks `AUD001`–`AUD010`.

---

## 8. Tooling: LSP, DAP, CLI & VS Code

* **LSP 2.0** (`src/lsp/`): JSON-RPC server with hover, completion, definitions, semantic tokens.
* **DAP** (`src/debug/`): Debug Adapter Protocol server with breakpoints, stepping, stack inspection.
* **VS Code Extension** (`vscode-extension/`): TextMate grammar, language config, DAP launch provider.
* **CLI** (`src/cli/`): Canonical commands (`build`, `run`, `test`, `check`, `fmt`, `lint`, `lsp`, `doctor`, `migrate`, `verify-release`).
* **Governance**: RFC repository in `rfcs/`, `docs/roadmap.md`, `docs/maintenance-policy.md`.

---

## 9. Edition System & Evolution Strategy

* **Edition 2026**: Stable 1.0.0 freeze. Any project targeting Edition 2026 maintains zero breaking changes.
* **Edition 2027**: Opt-in language evolution target allowing HKD 1.1 features.
* **Feature Gating**: `#feature(...)` allows fine-grained experimental opt-in for testing before standardization.
