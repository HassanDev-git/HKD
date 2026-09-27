/**
 * HKD Type System
 *
 * Defines the internal type representation used by the semantic analyser
 * and bytecode compiler.
 */
export type HkdType = PrimitiveType | ArrayType | FunctionType | StructType | NullableType | UnknownType | NeverType | AnyType | TypeParamType | ResultType | FutureType;
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
export declare const T_INT: PrimitiveType;
export declare const T_FLOAT: PrimitiveType;
export declare const T_STRING: PrimitiveType;
export declare const T_BOOL: PrimitiveType;
export declare const T_NULL: PrimitiveType;
export declare const T_UNKNOWN: UnknownType;
export declare const T_NEVER: NeverType;
export declare const T_ANY: AnyType;
export declare function makeArray(elementType: HkdType): ArrayType;
export declare function makeFunction(params: HkdType[], returnType: HkdType): FunctionType;
export declare function makeNullable(inner: HkdType): NullableType;
export declare function makeTypeParam(name: string, bound?: string): TypeParamType;
export declare function makeResult(okType: HkdType, errType: HkdType): ResultType;
export declare function makeFuture(valueType: HkdType): FutureType;
export declare function typeToString(t: HkdType): string;
/** Structural type equality. */
export declare function typesEqual(a: HkdType, b: HkdType): boolean;
/** Is `sub` assignable to `target`? */
export declare function isAssignable(target: HkdType, sub: HkdType): boolean;
//# sourceMappingURL=types.d.ts.map