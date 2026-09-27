"use strict";
/**
 * HKD Scope / Symbol Table
 *
 * Implements lexical scoping with a linked-list of scope frames.
 * Each symbol records its type, mutability, whether it was used, and location.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Scope = void 0;
exports.createGlobalScope = createGlobalScope;
// ─── Scope frame ─────────────────────────────────────────────────────────────
class Scope {
    symbols = new Map();
    parent;
    isFunction; // true for function bodies (return allowed)
    isLoop; // true for loop bodies (break/continue allowed)
    constructor(parent = null, isFunction = false, isLoop = false) {
        this.parent = parent;
        this.isFunction = isFunction;
        this.isLoop = isLoop;
    }
    /** Define a new symbol in this scope. Returns false if already defined. */
    define(sym) {
        if (this.symbols.has(sym.name))
            return false;
        this.symbols.set(sym.name, sym);
        return true;
    }
    /** Look up a symbol starting from this scope, walking up to parents. */
    lookup(name) {
        const sym = this.symbols.get(name);
        if (sym)
            return sym;
        return this.parent?.lookup(name) ?? null;
    }
    /** Look up only in this immediate scope (no parent walk). */
    lookupLocal(name) {
        return this.symbols.get(name) ?? null;
    }
    /** Update an existing symbol's type. Returns false if not found. */
    update(name, type) {
        const sym = this.symbols.get(name);
        if (sym) {
            sym.type = type;
            return true;
        }
        return this.parent?.update(name, type) ?? false;
    }
    /** Mark a symbol as used. */
    markUsed(name) {
        const sym = this.symbols.get(name);
        if (sym) {
            sym.used = true;
            return;
        }
        this.parent?.markUsed(name);
    }
    /** Are we inside a function? (walk up the chain) */
    isInsideFunction() {
        if (this.isFunction)
            return true;
        return this.parent?.isInsideFunction() ?? false;
    }
    /** Are we inside a loop? */
    isInsideLoop() {
        if (this.isLoop)
            return true;
        if (this.isFunction)
            return false; // functions reset loop context
        return this.parent?.isInsideLoop() ?? false;
    }
    /** Collect all unused symbols defined in this scope (for warnings). */
    unusedSymbols() {
        return Array.from(this.symbols.values()).filter((s) => !s.used && !s.name.startsWith("_"));
    }
    allSymbols() {
        return Array.from(this.symbols.values());
    }
}
exports.Scope = Scope;
// ─── Global scope factory ─────────────────────────────────────────────────────
const types_js_1 = require("./types.js");
function createGlobalScope() {
    const scope = new Scope();
    // Built-in functions
    const builtins = [
        ["print", [types_js_1.T_ANY], types_js_1.T_NULL],
        ["println", [types_js_1.T_ANY], types_js_1.T_NULL],
        ["input", [types_js_1.T_STRING], types_js_1.T_STRING],
        ["len", [types_js_1.T_ANY], types_js_1.T_INT],
        ["type_of", [types_js_1.T_ANY], types_js_1.T_STRING],
        ["to_string", [types_js_1.T_ANY], types_js_1.T_STRING],
        ["to_int", [types_js_1.T_ANY], types_js_1.T_INT],
        ["to_float", [types_js_1.T_ANY], types_js_1.T_FLOAT],
        ["to_bool", [types_js_1.T_ANY], types_js_1.T_BOOL],
        ["exit", [types_js_1.T_INT], types_js_1.T_NULL],
        ["assert", [types_js_1.T_BOOL, types_js_1.T_STRING], types_js_1.T_NULL],
        ["panic", [types_js_1.T_STRING], types_js_1.T_NULL],
        ["range", [types_js_1.T_INT, types_js_1.T_INT], { kind: "Array", elementType: types_js_1.T_INT }],
        ["__hkd_future", [types_js_1.T_ANY], (0, types_js_1.makeFuture)(types_js_1.T_ANY)],
        ["__hkd_resolve", [types_js_1.T_ANY, types_js_1.T_ANY], types_js_1.T_ANY],
        ["__hkd_reject", [types_js_1.T_ANY, types_js_1.T_ANY], types_js_1.T_ANY],
        ["__hkd_is_pending", [types_js_1.T_ANY], types_js_1.T_BOOL],
        ["__hkd_unwrap", [types_js_1.T_ANY], types_js_1.T_ANY],
        ["__hkd_on_complete", [types_js_1.T_ANY, types_js_1.T_ANY], types_js_1.T_ANY],
    ];
    const dummySpan = {
        start: { file: "<builtin>", line: 0, column: 0, offset: 0 },
        end: { file: "<builtin>", line: 0, column: 0, offset: 0 },
    };
    for (const [name, params, ret] of builtins) {
        scope.define({
            name,
            type: (0, types_js_1.makeFunction)(params, ret),
            mutable: false,
            defined: true,
            used: true, // builtins are always considered "used"
            declSpan: dummySpan,
            isFunction: true,
            isStruct: false,
        });
    }
    return scope;
}
//# sourceMappingURL=scope.js.map