# RFC: Inherent Struct Methods for HKD

- **Feature Name:** `inherent_methods`
- **Start Date:** September 2026
- **Target Edition:** `2027` (or Opt-In `#feature(methods)`)
- **Status:** `Draft / Proposal`
- **Related RFCs:** [RFC-003: Behavioural Contracts & Traits](../rfcs/003-traits.md)

---

## 1. Summary

This RFC introduces **inherent struct methods** to HKD via `impl` blocks:

```hkd
struct Rectangle {
    width: Float
    height: Float
}

impl Rectangle {
    fn area(self) -> Float {
        return self.width * self.height
    }

    fn perimeter(self) -> Float {
        return 2.0 * (self.width + self.height)
    }

    fn scale(self, factor: Float) -> Rectangle {
        return Rectangle {
            width: self.width * factor,
            height: self.height * factor
        }
    }
}

let rect = Rectangle { width: 10.0, height: 5.0 }
print("Area: " + to_string(rect.area()))
```

Inherent methods lower to **zero-overhead static monomorphic calls** at compile time, eliminating any runtime dispatch, dictionary lookup, or vtable overhead.

---

## 2. Motivation

HKD 1.0/1.1 supports strongly typed data structs:
```hkd
struct Point {
    x: Float
    y: Float
}
```
However, all behavior must currently be implemented via global free functions:
```hkd
fn point_distance(a: Point, b: Point) -> Float { ... }
fn point_normalize(p: Point) -> Point { ... }
```

In real-world applications (as observed during Phase 3 dogfooding in `examples/dogfood/multi_file_app/` and `examples/structs/`), this creates significant developer friction:
1. **API Discoverability / Autocompletion:** In an IDE with LSP, typing `rect.` only shows fields (`width`, `height`), with no discovery of associated domain functions.
2. **Namespace Pollution:** Every struct operation must invent a prefixed global name (`rect_area`, `rect_contains`, `order_calculate_total`).
3. **Chaining Ergonomics:** Method chaining (`user.validate().save()`) is impossible, forcing nested inside-out function calls (`save(validate(user))`).

---

## 3. Guide-Level Specification

### 3.1 Method Definition
An `impl <StructName>` block groups methods associated with a declared struct:

```hkd
struct Circle {
    radius: Float
}

impl Circle {
    // Instance method: receives `self` as the first argument
    fn area(self) -> Float {
        return 3.14159 * self.radius * self.radius
    }

    // Associated static function: does not take `self`
    fn unit() -> Circle {
        return Circle { radius: 1.0 }
    }
}
```

### 3.2 Method Invocation
* **Instance Methods:** Invoked on an instance using dot syntax:
  ```hkd
  let c = Circle { radius: 5.0 }
  let a = c.area()
  ```
* **Associated Functions:** Invoked on the struct type name:
  ```hkd
  let unit_circle = Circle.unit()
  ```

---

## 4. Compiler Architecture & Lowering Strategy

### 4.1 Static Monomorphic Lowering
Because HKD features a static type checker, the type of the receiver expression `c` in `c.area()` is resolved at compile time:
1. `c` has static type `Circle`.
2. The semantic analyser looks up `area` in `Circle`'s method table.
3. The method call is lowered to a static function invocation:
   ```text
   c.area()  ===>  Circle__area(c)
   ```
4. **Bytecode Lowering:**
   - Emits bytecode for `c`.
   - Emits `Op.Call` to the compiled chunk for `Circle__area`.
   - **Zero vtable lookups.**
   - **Zero dynamic map allocations.**
   - Exactly identical performance to a manual free function call.

### 4.2 AST Additions
```typescript
export interface ImplBlockStmt extends AstNode {
  kind: "ImplBlockStmt";
  structName: string;
  methods: FunctionDeclStmt[];
}

// MemberExpr call disambiguation:
// `obj.method(args)` is parsed as CallExpr { callee: MemberExpr { object: obj, property: "method" }, args }
```

### 4.3 Semantic Analyser Pipeline
1. **Pass 1 (Hoisting):** Collect all struct declarations and `impl` blocks. Populate `structMethods: Map<string, Map<string, FunctionType>>`.
2. **Pass 2 (Body Analysis):** For each method in `impl S`, insert `self: S` into the method scope.
3. **Pass 3 (Call Resolution):** When visiting `CallExpr` where `callee` is `MemberExpr`:
   - Analyse receiver `callee.object` -> resolves to `StructType(S)`.
   - Check if `callee.property` exists in `structMethods.get(S)`.
   - If found, validate argument types matching method parameters.
   - If not found, check struct fields. If field is not a function, emit diagnostic `E309: Struct \`S\` has no method \`property\``, providing suggestions via Levenshtein distance.

---

## 5. Synergy with RFC-003 (Traits)

Inherent methods form the foundation for RFC-003 Behavioural Contracts & Traits:
* `impl Struct { ... }` defines **inherent** methods specific to that struct.
* `impl Trait for Struct { ... }` implements **contract** methods defined by a trait.
* Both use the identical `self` parameter convention and the identical static monomorphic lowering mechanism.
* Implementing inherent methods in the compiler directly satisfies 70% of the lowering infrastructure needed for RFC-003 Traits.

---

## 6. Backward Compatibility & Edition Gating

* **Edition 2026 (Default):** Remains unchanged. `impl` is an identifier or contextual keyword.
* **Edition 2027 (Opt-in):** `impl` is a reserved statement keyword.
* Fully backward compatible with all existing HKD 1.0 and 1.1 codebases.
