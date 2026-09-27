"use strict";
/**
 * HKD Type System
 *
 * Defines the internal type representation used by the semantic analyser
 * and bytecode compiler.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.T_ANY = exports.T_NEVER = exports.T_UNKNOWN = exports.T_NULL = exports.T_BOOL = exports.T_STRING = exports.T_FLOAT = exports.T_INT = void 0;
exports.makeArray = makeArray;
exports.makeFunction = makeFunction;
exports.makeNullable = makeNullable;
exports.makeTypeParam = makeTypeParam;
exports.makeResult = makeResult;
exports.makeFuture = makeFuture;
exports.typeToString = typeToString;
exports.typesEqual = typesEqual;
exports.isAssignable = isAssignable;
// ─── Singletons ───────────────────────────────────────────────────────────────
exports.T_INT = { kind: "Int" };
exports.T_FLOAT = { kind: "Float" };
exports.T_STRING = { kind: "String" };
exports.T_BOOL = { kind: "Bool" };
exports.T_NULL = { kind: "Null" };
exports.T_UNKNOWN = { kind: "Unknown" };
exports.T_NEVER = { kind: "Never" };
exports.T_ANY = { kind: "Any" };
// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeArray(elementType) {
    return { kind: "Array", elementType };
}
function makeFunction(params, returnType) {
    return { kind: "Function", params, returnType };
}
function makeNullable(inner) {
    return { kind: "Nullable", inner };
}
function makeTypeParam(name, bound) {
    return { kind: "TypeParam", name, bound };
}
function makeResult(okType, errType) {
    return { kind: "Result", okType, errType };
}
function makeFuture(valueType) {
    return { kind: "Future", valueType };
}
function typeToString(t) {
    switch (t.kind) {
        case "Int": return "Int";
        case "Float": return "Float";
        case "String": return "String";
        case "Bool": return "Bool";
        case "Null": return "Null";
        case "Unknown": return "unknown";
        case "Never": return "never";
        case "Any": return "any";
        case "Array": return `[${typeToString(t.elementType)}]`;
        case "Nullable": return `${typeToString(t.inner)}?`;
        case "Struct": return t.name;
        case "TypeParam": return t.name;
        case "Result": return `Result<${typeToString(t.okType)}, ${typeToString(t.errType)}>`;
        case "Future": return `Future<${typeToString(t.valueType)}>`;
        case "Function": {
            const params = t.params.map(typeToString).join(", ");
            return `fn(${params}) -> ${typeToString(t.returnType)}`;
        }
    }
}
/** Structural type equality. */
function typesEqual(a, b) {
    if (a.kind === "Any" || b.kind === "Any")
        return true;
    if (a.kind !== b.kind)
        return false;
    switch (a.kind) {
        case "Array":
            return typesEqual(a.elementType, b.elementType);
        case "Nullable":
            return typesEqual(a.inner, b.inner);
        case "Function": {
            const bf = b;
            if (a.params.length !== bf.params.length)
                return false;
            return (a.params.every((p, i) => typesEqual(p, bf.params[i])) &&
                typesEqual(a.returnType, bf.returnType));
        }
        case "Struct":
            return a.name === b.name;
        case "TypeParam":
            return a.name === b.name;
        case "Result": {
            const br = b;
            return typesEqual(a.okType, br.okType) && typesEqual(a.errType, br.errType);
        }
        case "Future": {
            const bf = b;
            return typesEqual(a.valueType, bf.valueType);
        }
        default:
            return true; // same primitive kind
    }
}
/** Is `sub` assignable to `target`? */
function isAssignable(target, sub) {
    if (target.kind === "Any" || sub.kind === "Any")
        return true;
    if (sub.kind === "Never")
        return true;
    if (sub.kind === "Null" && target.kind === "Nullable")
        return true;
    if (target.kind === "Nullable") {
        return isAssignable(target.inner, sub);
    }
    if (target.kind === "TypeParam" || sub.kind === "TypeParam")
        return true;
    if (target.kind === "Result" && sub.kind === "Result") {
        return isAssignable(target.okType, sub.okType) && isAssignable(target.errType, sub.errType);
    }
    if (target.kind === "Future" && sub.kind === "Future") {
        return isAssignable(target.valueType, sub.valueType);
    }
    return typesEqual(target, sub);
}
//# sourceMappingURL=types.js.map