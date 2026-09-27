# HKD Type System Specification 2.0

**Language Edition**: Edition 2026 (Base) / Edition 2027 (Evolution)  
**Document Status**: Stable Reference Specification  
**Version**: 1.1.0  

---

## 1. Type Universe & Categories

HKD's type system is static, strongly typed, and structurally checked with explicit nominal declarations for structs. Types are partitioned into:

```text
Type ::=
    | PrimitiveType
    | StructType
    | ArrayType
    | FunctionType
    | ResultType
    | TypeVariable
    | NullableType
```

### 1.1 Primitive Types
- `Int`: 64-bit signed integer (two's complement).
- `Float`: 64-bit IEEE 754 double precision floating point number.
- `String`: Immutable UTF-8 encoded byte sequence.
- `Bool`: Boolean truth values (`true`, `false`).
- `Null`: The singleton absence value (`null`).

### 1.2 Compound & Reference Types
- `Struct`: User-declared record type with named, typed fields:
  $$\text{struct } S \{ f_1: T_1, \dots, f_n: T_n \}$$
- `Array`: Homogeneous, dynamically resizable sequence:
  $$[T]$$
- `Function`: First-class callable signature:
  $$\text{fn}(T_1, \dots, T_k) \to R$$
- `Result`: Algebraic error-handling union:
  $$\text{Result}\langle T, E \rangle \cong \text{Ok}(T) \mid \text{Err}(E)$$

---

## 2. Type Checking & Subtyping

HKD enforces strict typing with minimal implicit coercions to preserve deterministic execution and avoid hidden allocations.

### 2.1 Subtyping Relations ($\le$)
1. **Reflexivity**: $\forall T, \; T \le T$.
2. **Nullability**: If $T$ is nullable ($T?$), then $\text{Null} \le T?$ and $T \le T?$.
3. **Numeric Disjointness**: $\text{Int} \not\le \text{Float}$ and $\text{Float} \not\le \text{Int}$. Explicit cast expressions (`x as Float` or `to_int(f)`) are required for conversions.

---

## 3. Generics & Call-Site Inference (RFC-001)

### 3.1 Generic Signatures
A generic function declares one or more type parameters enclosed in angle brackets:
$$\text{fn } f\langle \alpha_1, \dots, \alpha_m \rangle(x_1: T_1, \dots, x_n: T_n) \to R$$

### 3.2 Type Argument Deduction (Unification)
When invoking a generic function without explicit type arguments:
$$f(e_1, \dots, e_n)$$
The compiler performs constraint unification between the argument types $\tau_i = \text{type}(e_i)$ and parameter types $T_i$:
$$\text{unify}(\tau_i, T_i[\vec{\alpha} \mapsto \vec{\beta}]) = \sigma$$
If a unique, consistent substitution $\sigma$ resolves all $\alpha_j$, the call site specializes cleanly. If ambiguous or conflicting types are inferred, error `E201` is emitted, requiring explicit call-site parameterization:
$$f\langle \text{Int} \rangle(e_1)$$

---

## 4. Pattern Matching Typing & Exhaustiveness (RFC-002)

A pattern matching expression evaluates a discriminant expression of type $T_D$ against ordered match arms:
$$\text{match } e \{ p_1 \Rightarrow b_1, \dots, p_k \Rightarrow b_k \}$$

### 4.1 Arm Compatibility
For each arm $p_i \Rightarrow b_i$:
- The pattern $p_i$ must be statically compatible with $T_D$.
- The result expression $b_i$ must have a type $T_{b_i}$ such that $\forall i, j: \; T_{b_i} = T_{b_j} = T_{\text{match}}$.

### 4.2 Exhaustiveness Requirements
- If $T_D$ is a primitive type (such as `Int` or `String`), a wildcard pattern (`_`) or unconditional variable binding pattern is mandatory unless all discrete values are proven covered.
- Unreachable arms following an exhaustive pattern are flagged with warning `E301`.

---

## 5. Result Error Handling Model (RFC-005)

The `Result` construct models expected failure conditions without stack unwinding or exception panics.

### 5.1 Variant Constructors
- `result.ok(v: T) -> Result<T, None>`
- `result.err(e: E) -> Result<None, E>`

### 5.2 Safe Consumption
- Inspection: `result.is_ok(r)`, `result.is_err(r)`
- Monadic Projection:
  $$\text{result.map}(r: \text{Result}\langle T, E \rangle, f: T \to U) \to \text{Result}\langle U, E \rangle$$
  $$\text{result.and\_then}(r: \text{Result}\langle T, E \rangle, f: T \to \text{Result}\langle U, E \rangle) \to \text{Result}\langle U, E \rangle$$
- Forced Unwrapping:
  `result.unwrap(r)` returns $T$ if `is_ok`, or raises runtime error `E405` if `is_err`.

---

## 6. Edition Gating Matrix

| Type Feature | Edition 2026 | Edition 2027 | Feature Flag |
| :--- | :---: | :---: | :---: |
| Primitives, Structs, Arrays | Supported | Supported | Core |
| Generic Functions (`<T>`) | Prohibited (E201) | Supported | `#feature(generics)` |
| Pattern Matching (`match`) | Prohibited (E201) | Supported | `#feature(pattern_matching)` |
| Result Monadic APIs | Prohibited (E201) | Supported | `#feature(result)` |
| Traits (RFC-003) | Prohibited | Experimental | `#feature(traits)` |
| Async/Await Syntax (RFC-004) | Prohibited | Experimental | `#feature(async)` |
