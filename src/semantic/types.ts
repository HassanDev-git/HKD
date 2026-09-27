/**
 * HKD Type System
 *
 * Defines the internal type representation used by the semantic analyser
 * and bytecode compiler.
 */

// ─── HKD Types ────────────────────────────────────────────────────────────────

export type HkdType =
  | PrimitiveType
  | ArrayType
  | FunctionType
  | StructType
  | NullableType
  | UnknownType
  | NeverType
  | AnyType
  | TypeParamType
  | ResultType
  | FutureType;

export interface PrimitiveType {
  kind: "Int" | "Float" | "String" | "Bool" | "Null";
}

export interface ArrayType {
  kind: "Array";
  elementType: HkdType;
}

export interface FunctionType {
  kind: "Function";
  params: HkdType[];
  returnType: HkdType;
}

export interface StructType {
  kind: "Struct";
  name: string;
  fields: Map<string, HkdType>;
}

export interface NullableType {
  kind: "Nullable";
  inner: HkdType;
}

/** Used when the type cannot be inferred yet (type inference placeholder). */
export interface UnknownType {
  kind: "Unknown";
}

/** Type of expressions that never return (e.g. return, break). */
export interface NeverType {
  kind: "Never";
}

/** Escape hatch for dynamic typing in stdlib interop. */
export interface AnyType {
  kind: "Any";
}

/** Generic type parameter placeholder (e.g. T in fn id<T>(x: T) -> T). */
export interface TypeParamType {
  kind: "TypeParam";
  name: string;
  bound?: string;
}

/** Result type: Result<T, E> for robust error handling. */
export interface ResultType {
  kind: "Result";
  okType: HkdType;
  errType: HkdType;
}

/** Future type: Future<T> for asynchronous computations. */
export interface FutureType {
  kind: "Future";
  valueType: HkdType;
}

// ─── Singletons ───────────────────────────────────────────────────────────────

export const T_INT: PrimitiveType    = { kind: "Int" };
export const T_FLOAT: PrimitiveType  = { kind: "Float" };
export const T_STRING: PrimitiveType = { kind: "String" };
export const T_BOOL: PrimitiveType   = { kind: "Bool" };
export const T_NULL: PrimitiveType   = { kind: "Null" };
export const T_UNKNOWN: UnknownType  = { kind: "Unknown" };
export const T_NEVER: NeverType      = { kind: "Never" };
export const T_ANY: AnyType          = { kind: "Any" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function makeArray(elementType: HkdType): ArrayType {
  return { kind: "Array", elementType };
}

export function makeFunction(params: HkdType[], returnType: HkdType): FunctionType {
  return { kind: "Function", params, returnType };
}

export function makeNullable(inner: HkdType): NullableType {
  return { kind: "Nullable", inner };
}

export function makeTypeParam(name: string, bound?: string): TypeParamType {
  return { kind: "TypeParam", name, bound };
}

export function makeResult(okType: HkdType, errType: HkdType): ResultType {
  return { kind: "Result", okType, errType };
}

export function makeFuture(valueType: HkdType): FutureType {
  return { kind: "Future", valueType };
}

export function typeToString(t: HkdType): string {
  switch (t.kind) {
    case "Int":       return "Int";
    case "Float":     return "Float";
    case "String":    return "String";
    case "Bool":      return "Bool";
    case "Null":      return "Null";
    case "Unknown":   return "unknown";
    case "Never":     return "never";
    case "Any":       return "any";
    case "Array":     return `[${typeToString(t.elementType)}]`;
    case "Nullable":  return `${typeToString(t.inner)}?`;
    case "Struct":    return t.name;
    case "TypeParam": return t.name;
    case "Result":    return `Result<${typeToString(t.okType)}, ${typeToString(t.errType)}>`;
    case "Future":    return `Future<${typeToString(t.valueType)}>`;
    case "Function": {
      const params = t.params.map(typeToString).join(", ");
      return `fn(${params}) -> ${typeToString(t.returnType)}`;
    }
  }
}

/** Structural type equality. */
export function typesEqual(a: HkdType, b: HkdType): boolean {
  if (a.kind === "Any" || b.kind === "Any") return true;
  if (a.kind !== b.kind) return false;

  switch (a.kind) {
    case "Array":
      return typesEqual(a.elementType, (b as ArrayType).elementType);
    case "Nullable":
      return typesEqual(a.inner, (b as NullableType).inner);
    case "Function": {
      const bf = b as FunctionType;
      if (a.params.length !== bf.params.length) return false;
      return (
        a.params.every((p, i) => typesEqual(p, bf.params[i])) &&
        typesEqual(a.returnType, bf.returnType)
      );
    }
    case "Struct":
      return a.name === (b as StructType).name;
    case "TypeParam":
      return a.name === (b as TypeParamType).name;
    case "Result": {
      const br = b as ResultType;
      return typesEqual(a.okType, br.okType) && typesEqual(a.errType, br.errType);
    }
    case "Future": {
      const bf = b as FutureType;
      return typesEqual(a.valueType, bf.valueType);
    }
    default:
      return true; // same primitive kind
  }
}

/** Is `sub` assignable to `target`? */
export function isAssignable(target: HkdType, sub: HkdType): boolean {
  if (target.kind === "Any" || sub.kind === "Any") return true;
  if (sub.kind === "Never") return true;
  if (sub.kind === "Null" && target.kind === "Nullable") return true;
  if (target.kind === "Nullable") {
    return isAssignable((target as NullableType).inner, sub);
  }
  if (target.kind === "TypeParam" || sub.kind === "TypeParam") return true;
  if (target.kind === "Result" && sub.kind === "Result") {
    return isAssignable(target.okType, sub.okType) && isAssignable(target.errType, sub.errType);
  }
  if (target.kind === "Future" && sub.kind === "Future") {
    return isAssignable(target.valueType, (sub as FutureType).valueType);
  }
  return typesEqual(target, sub);
}
