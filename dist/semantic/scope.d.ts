/**
 * HKD Scope / Symbol Table
 *
 * Implements lexical scoping with a linked-list of scope frames.
 * Each symbol records its type, mutability, whether it was used, and location.
 */
import { SourceSpan } from "../errors/index.js";
import { HkdType } from "./types.js";
export interface Symbol {
    name: string;
    type: HkdType;
    mutable: boolean;
    defined: boolean;
    used: boolean;
    declSpan: SourceSpan;
    isFunction: boolean;
    isStruct: boolean;
}
export declare class Scope {
    private symbols;
    readonly parent: Scope | null;
    readonly isFunction: boolean;
    readonly isLoop: boolean;
    constructor(parent?: Scope | null, isFunction?: boolean, isLoop?: boolean);
    /** Define a new symbol in this scope. Returns false if already defined. */
    define(sym: Symbol): boolean;
    /** Look up a symbol starting from this scope, walking up to parents. */
    lookup(name: string): Symbol | null;
    /** Look up only in this immediate scope (no parent walk). */
    lookupLocal(name: string): Symbol | null;
    /** Update an existing symbol's type. Returns false if not found. */
    update(name: string, type: HkdType): boolean;
    /** Mark a symbol as used. */
    markUsed(name: string): void;
    /** Are we inside a function? (walk up the chain) */
    isInsideFunction(): boolean;
    /** Are we inside a loop? */
    isInsideLoop(): boolean;
    /** Collect all unused symbols defined in this scope (for warnings). */
    unusedSymbols(): Symbol[];
    allSymbols(): Symbol[];
}
export declare function createGlobalScope(): Scope;
//# sourceMappingURL=scope.d.ts.map