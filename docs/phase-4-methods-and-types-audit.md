# HKD Phase 4 — Methods, Type Safety & Production Language Foundations
## Comprehensive Pre-Implementation Architectural Audit

**Date:** September 2026  
**Auditor:** Lead Compiler Engineer, Runtime Architect & Type Systems Lead  
**Language Baseline:** HKD 1.1.0 (Edition 2026 Default, Edition 2027 Opt-In)  
**Verification Baseline:** 102/102 test suites PASS, 807/807 tests PASS, 18/18 release gates PASS  
**Target Document:** `docs/phase-4-methods-and-types-audit.md`  

---

## 1. Executive Summary & Audit Objectives

Phase 4 bridges the gap between HKD's hardened systems foundations (native/reference VMs, JIT, AOT, 18 automated gates) and day-to-day developer productivity. The primary objectives are:
1. **Inherent Struct Method System:** Establishing `impl Struct { fn method(self, ...) ... }` with static monomorphic lowering (`user.greet() ===> User__greet(user)`), guaranteeing zero runtime dispatch overhead across Stack VM, Native VM, JIT, and AOT.
2. **Type Safety & `T_ANY` Semantics Audit:** Investigating variable initialization, assignment type checking, and dynamic fallback rules to eliminate unchecked assignments and establish clear type safety boundaries.
3. **Developer Tooling & Diagnostics:** Ensuring methods are first-class citizens in the compiler, LSP (completion, hover, go-to-definition), and DAP debugger (stack frames, inspecting `self`).

---

## 2. Complete Architectural Representation Across Subsystems

We audited all relevant compiler and runtime layers: `src/parser/`, `src/semantic/`, `src/bytecode/compiler.ts`, `src/runtime/`, `src/vm/`, `native-runtime/`, `src/ir/`, `src/lsp/`, `src/debug/`.

### 2.1 Structs & Fields
* **Parser (`src/ast/nodes.ts`):**
  - Declared via `StructDeclStmt`: `{ name: string, fields: StructField[], exported: boolean }`.
  - Constructed via `StructInitExpr`: `{ name: string, fields: ObjectField[] }`. Supports field shorthand `{ key }` (added in Phase 3).
* **Semantic Analyser (`src/semantic/analyser.ts`, `types.ts`):**
  - Represented as `StructType`: `{ kind: "Struct", name: string, fields: Map<string, HkdType> }`.
  - Member access is parsed as `MemberExpr { object: Expr, property: string }`.
  - `analyseMember` verifies field existence on `StructType` and returns the field's declared type.
* **Runtime & VMs (`src/bytecode/compiler.ts`, `src/vm/vm.ts`, `native-runtime/src/vm.zig`):**
  - Struct instances are compiled via `Op.MakeObject` with an explicit `__type__: StructName` attribute.
  - Runtime representation is an `HkdObject` (`std.StringHashMap(Value)` in Zig VM; `Map<string, HkdValue>` in TS VM).
  - Field access emits `Op.GetField <nameIdx>`. Monomorphic inline caching (MIC/PIC) accelerates repeated field lookups in both VMs.

### 2.2 Functions & Parameters
* **Parser (`src/ast/nodes.ts`):**
  - Declared via `FunctionDeclStmt`: `{ name: string, params: Param[], returnType: TypeExpr | null, body: BlockStmt, exported: boolean }`.
  - Parameters: `Param { name: string, typeAnnotation: TypeExpr | null, defaultValue: Expr | null }`.
* **Semantic Analyser:**
  - Represented as `FunctionType`: `{ kind: "Function", params: HkdType[], returnType: HkdType }`.
  - Scope registers function symbols as immutable bindings with arity and type signatures.
* **Runtime & VMs:**
  - Compiles to `HkdFunction` chunk or `HkdClosure` with captured upvalues.
  - Invoked via `Op.Call <argc>`. The stack convention across both VMs is `[callee, arg1, arg2, ...]`.

### 2.3 Member Access vs Call Expression: How `user.name` vs `user.greet()` Works Today

#### A. How `user.name` Currently Works:
1. **Parser:** Parses `user.name` into `MemberExpr { object: IdentExpr("user"), property: "name" }`.
2. **Semantic Analyser:** Evaluates `objType = analyseExpr(user)`. If `objType` is `StructType`, verifies that `"name"` exists in `objType.fields`. Returns the field's type (`String`).
3. **Compiler:** Compiles `user` expression onto the stack, then emits `Op.GetField <nameConst("name")>`.
4. **Runtime:** VM pops `user` object and retrieves the value of field `"name"`.

#### B. How `user.greet()` Currently Behaves (Without Methods):
1. **Parser:** Parses `user.greet` as `MemberExpr`, then encounters `(` and parses `CallExpr { callee: MemberExpr { object: user, property: "greet" }, args: [] }`.
2. **Semantic Analyser:** Evaluates `calleeType = analyseExpr(expr.callee)`.
   - `analyseMember` looks up `"greet"` in `User.fields`.
   - Because `"greet"` is not a struct data field, `analyseMember` emits:
     ```text
     HKD Error[E309]: Struct `User` has no field `greet`
     ```
   - If error suppression is bypassed, `analyseCall` reports `calleeType` (`T_UNKNOWN` or `T_NULL`) is not callable (`E408`).
3. **Runtime:** If executed dynamically, `Op.GetField "greet"` yields `null`. `Op.Call` attempts to invoke `null` and raises:
   ```text
   HKD Runtime Error: Value is not callable
   ```

#### C. How `user.greet()` Will Work With Inherent Struct Methods:
1. **Parser:** Parses `impl User { fn greet(self) -> String { ... } }` into `ImplBlockStmt`.
2. **Semantic Analyser:**
   - Hoists `impl User` blocks into a struct method registry: `structMethods: Map<string, Map<string, FunctionType>>`.
   - When visiting `CallExpr` where `callee` is `MemberExpr`:
     - Checks if `callee.object` is a `StructType(User)`.
     - Checks if `callee.property` exists in `structMethods.get("User")`.
     - If found as a method, validates call arguments against the method parameters (skipping `self`).
     - Returns the method's declared return type.
3. **Compiler (Static Lowering):**
   - Rewrites `user.greet(...)` at bytecode emission:
     ```text
     user.greet(arg1, arg2)  ===>  User__greet(user, arg1, arg2)
     ```
   - Emits bytecode for `user` as the first argument (`self`).
   - Emits bytecode for `arg1, arg2`.
   - Emits `Op.Call` to the compiled function `User__greet` with `argc = args.length + 1`.
4. **Runtime:** Executes as a standard static function call. Zero vtables, zero dictionary lookup, 100% compatible with Stack VM, Native VM, JIT, and AOT.

---

## 3. Method System Design & Semantics

### 3.1 Receiver Semantics (`self`)
* **Receiver Model:** **Compiler-Lowered Value Receiver.**
* `self` is the first formal parameter of the method function.
* When invoking `r.scale(2.0)`, `r` is passed by value (reference semantics for objects/structs in HKD's runtime model).
* **Explicit Immutability / Mutation Policy:**
  - HKD does not currently support C++-style `&mut` references.
  - Modifying `self.field = value` within a method modifies the underlying struct fields of that instance.
  - Reassigning `self = other` is strictly forbidden and rejected at compile time (`E405: Cannot reassign to self`).

### 3.2 Member Lookup Order
To eliminate ambiguity when evaluating `obj.foo`:
1. **Struct Fields:** If `foo` is a declared field on the struct, it resolves as a field access (`MemberExpr`).
2. **Struct Inherent Methods:** If `foo` is an `impl` method and is part of a `CallExpr` (`obj.foo(...)`), it resolves to the inherent method.
3. **Built-in Operations:** Standard library/runtime member operations (such as array `length`, string `trim`).
4. **Error Diagnostic:** If none match, emit `E309` indicating whether fields or methods were available.

### 3.3 Field/Method Collision Rule
* **Language Rule:** **Methods and fields CANNOT share the same name on the same struct.**
* If `struct User { name: String }` and `impl User { fn name(self) -> String }` are declared:
  - The compiler emits a compile-time error:
    ```text
    HKD Error[E304]: Method `name` conflicts with existing field `name` on struct `User`
    ```
  - **Rationale:** Prevents ambiguity where `user.name` could mean either reading the string field or obtaining a method reference/closure.

### 3.4 Method Arguments & Chaining
* Methods support standard parameters, default arguments, and return types:
  ```hkd
  impl Calculator {
      fn add(self, a: Int, b: Int) -> Int { return a + b }
  }
  ```
* **Method Chaining:** Because each method invocation statically returns a known type:
  ```hkd
  user.get_account().get_balance()
  ```
  The compiler resolves the return type of `get_account()` (`Account`), then resolves `get_balance()` against `Account`. This enables arbitrary chaining with full static type checking.

### 3.5 Static / Associated Functions
* Associated functions (e.g. `User.new(...)` without `self`) can be defined within `impl User`:
  ```hkd
  impl User {
      fn new(name: String) -> User {
          return User { name: name }
      }
  }
  ```
* When invoked as `User.new("Alice")`, the callee `MemberExpr` has receiver `IdentExpr("User")` which matches a struct name, resolving directly to `User__new("Alice")`.

### 3.6 Cross-Module Imported Struct Methods
* When `User` and `impl User` are declared in `models.hkd`:
  - `export struct User` exports the struct type.
  - The methods `User__*` are exported functions of the module.
  - When imported in `main.hkd` via `import { User } from "./models.hkd"`, `loadModule` imports both the struct metadata and associated methods into the calling scope.

### 3.7 Generic Methods & Edition Compatibility
* **Current Generic Capability:** Generic functions `fn id<T>(x: T) -> T` are supported under `#feature(generics)` and `edition = "2027"`.
* **Generic Struct Methods (`impl Box<T>`):**
  - In Edition 2026: Structs do not take type parameters (`struct Box<T>` is not in 2026 grammar).
  - In Edition 2027: Methods on concrete structs can take generic type parameters (`fn map<U>(self, f: fn(T) -> U) -> U`).
  - Full parameterized `impl<T> Struct<T>` will be formally aligned with RFC-003/RFC-005 in Edition 2027.

---

## 4. Type Safety & `T_ANY` Deep Dive

### 4.1 Uninitialized `let` Audit
We audited the behavior of `let x;`:
```hkd
let x
```
1. **Declaration:** `analyseVarDecl` defines `x` with type `T_UNKNOWN` and runtime value `null`.
2. **Assignment:** When `x = 10` is executed:
   - `analyseAssign` evaluated `targetType` as `T_UNKNOWN`.
   - **Crucial Bug Discovered:** `analyseAssign` lacked a call to `isAssignable(targetType, valueType)`.
   - Consequently, `let x: Int = 10; x = "hello"` was accepted without error!
3. **Correction Required:**
   - In `analyseAssign`:
     - If `targetType !== T_UNKNOWN && targetType !== T_ANY && !isAssignable(targetType, valueType)`:
       Emit `E303: Type mismatch: Cannot assign \`String\` to \`Int\``.
     - If `targetType === T_UNKNOWN` (an uninitialized `let x`), the first assignment `x = 10` infers and updates `sym.type = valueType`! Subsequent assignments must conform to that inferred type.
   - If the developer desires dynamic typing, they must explicitly write `let x: Any = null`.

### 4.2 Formal Rules for `T_ANY`
To guarantee type safety across the language:
1. **Creation:** `T_ANY` is created ONLY:
   - By explicit annotation: `let x: Any = ...`
   - By dynamic stdlib interop (e.g. `json.parse`, dynamic imports)
   - When a function omits both parameter and return type annotations.
2. **Assignment:** `T_ANY` can be assigned to and from any type (gradual typing escape hatch).
3. **Member Access:** Accessing a member on `T_ANY` returns `T_ANY` (dynamic dispatch fallback).
4. **Boundary Policy:** Public module exports are encouraged to specify explicit type annotations to prevent unintentional `T_ANY` leakage.

---

## 5. Tooling Architecture (LSP & DAP)

### 5.1 Language Server Protocol (LSP)
* **Completion (`user.<TAB>`):**
  - When dot-completing `user.`:
    - Resolve the type of `user`. If it is `StructType(User)`, retrieve:
      1. All fields of `User` (kind `Field`)
      2. All methods of `User` from `structMethods` (kind `Method`)
* **Hover:**
  - Hovering over `user.greet` displays:
    ```text
    (method) User.greet(self) -> String
    ```
* **Go to Definition:**
  - Clicking on `user.greet()` navigates directly to `fn greet(self)` in `impl User`.
* **Semantic Tokens:**
  - Method identifiers receive semantic token type `"function"` with modifier `"declaration"`.

### 5.2 Debug Adapter Protocol (DAP)
* In `src/debug/debug-session.ts`, stack frame locals inspect `self` as a named local parameter.
* No internal `$receiver` names leak to the developer.
* Stepping into `user.greet()` enters the method body on line 1 with `self` bound to the receiver instance.

---

## 6. Implementation Plan for Step 2–6

1. **AST Additions (`src/ast/nodes.ts`):**
   - Add `ImplBlockStmt { kind: "ImplBlockStmt", structName: string, methods: FunctionDeclStmt[], span: SourceSpan }`.
2. **Parser Updates (`src/parser/parser.ts`):**
   - Add `parseImpl()`: parses `impl StructName { fn ... }`.
3. **Semantic Analyser Updates (`src/semantic/analyser.ts`):**
   - Register `structMethods: Map<string, Map<string, FunctionType>>`.
   - Check method/field collisions.
   - Update `analyseCall` / `analyseMember` to resolve method calls.
   - Fix `analyseAssign` to enforce `isAssignable` for typed variables and infer types for `T_UNKNOWN` variables.
4. **Bytecode Compiler Updates (`src/bytecode/compiler.ts`):**
   - Compile `ImplBlockStmt` into mangled functions `StructName__methodName`.
   - Lower `MemberExpr` calls on structs to `Op.Call` with receiver as first argument.
5. **Tooling Integration:**
   - Update `src/lsp/features.ts` for method completions, hovers, definitions.
   - Update `src/formatter/index.ts` to format `impl` blocks.
