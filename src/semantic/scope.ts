/**
 * HKD Scope / Symbol Table
 *
 * Implements lexical scoping with a linked-list of scope frames.
 * Each symbol records its type, mutability, whether it was used, and location.
 */

import { SourceSpan } from "../errors/index.js";
import { HkdType } from "./types.js";

// ─── Symbol ───────────────────────────────────────────────────────────────────

export interface Symbol {
  name: string;
  type: HkdType;
  mutable: boolean;
  defined: boolean;       // false = forward declaration
  used: boolean;
  declSpan: SourceSpan;
  isFunction: boolean;
  isStruct: boolean;
}

// ─── Scope frame ─────────────────────────────────────────────────────────────

export class Scope {
  private symbols: Map<string, Symbol> = new Map();
  public readonly parent: Scope | null;
  public readonly isFunction: boolean; // true for function bodies (return allowed)
  public readonly isLoop: boolean;     // true for loop bodies (break/continue allowed)

  constructor(
    parent: Scope | null = null,
    isFunction = false,
    isLoop = false
  ) {
    this.parent = parent;
    this.isFunction = isFunction;
    this.isLoop = isLoop;
  }

  /** Define a new symbol in this scope. Returns false if already defined. */
  define(sym: Symbol): boolean {
    if (this.symbols.has(sym.name)) return false;
    this.symbols.set(sym.name, sym);
    return true;
  }

  /** Look up a symbol starting from this scope, walking up to parents. */
  lookup(name: string): Symbol | null {
    const sym = this.symbols.get(name);
    if (sym) return sym;
    return this.parent?.lookup(name) ?? null;
  }

  /** Look up only in this immediate scope (no parent walk). */
  lookupLocal(name: string): Symbol | null {
    return this.symbols.get(name) ?? null;
  }

  /** Update an existing symbol's type. Returns false if not found. */
  update(name: string, type: HkdType): boolean {
    const sym = this.symbols.get(name);
    if (sym) {
      sym.type = type;
      return true;
    }
    return this.parent?.update(name, type) ?? false;
  }

  /** Mark a symbol as used. */
  markUsed(name: string): void {
    const sym = this.symbols.get(name);
    if (sym) {
      sym.used = true;
      return;
    }
    this.parent?.markUsed(name);
  }

  /** Are we inside a function? (walk up the chain) */
  isInsideFunction(): boolean {
    if (this.isFunction) return true;
    return this.parent?.isInsideFunction() ?? false;
  }

  /** Are we inside a loop? */
  isInsideLoop(): boolean {
    if (this.isLoop) return true;
    if (this.isFunction) return false; // functions reset loop context
    return this.parent?.isInsideLoop() ?? false;
  }

  /** Collect all unused symbols defined in this scope (for warnings). */
  unusedSymbols(): Symbol[] {
    return Array.from(this.symbols.values()).filter(
      (s) => !s.used && !s.name.startsWith("_")
    );
  }

  allSymbols(): Symbol[] {
    return Array.from(this.symbols.values());
  }
}

// ─── Global scope factory ─────────────────────────────────────────────────────

import {
  T_INT, T_FLOAT, T_STRING, T_BOOL, T_NULL, T_ANY,
  makeFunction, makeFuture,
} from "./types.js";

export function createGlobalScope(): Scope {
  const scope = new Scope();

  // Built-in functions
  const builtins: Array<[string, HkdType[], HkdType]> = [
    ["print",     [T_ANY],           T_NULL],
    ["println",   [T_ANY],           T_NULL],
    ["input",     [T_STRING],        T_STRING],
    ["len",       [T_ANY],           T_INT],
    ["type_of",   [T_ANY],           T_STRING],
    ["to_string", [T_ANY],           T_STRING],
    ["to_int",    [T_ANY],           T_INT],
    ["to_float",  [T_ANY],           T_FLOAT],
    ["to_bool",   [T_ANY],           T_BOOL],
    ["exit",      [T_INT],           T_NULL],
    ["assert",    [T_BOOL, T_STRING],T_NULL],
    ["panic",     [T_STRING],        T_NULL],
    ["range",     [T_INT, T_INT],    { kind: "Array", elementType: T_INT }],
    ["__hkd_future",     [T_ANY],           makeFuture(T_ANY)],
    ["__hkd_resolve",    [T_ANY, T_ANY],    T_ANY],
    ["__hkd_reject",     [T_ANY, T_ANY],    T_ANY],
    ["__hkd_is_pending", [T_ANY],           T_BOOL],
    ["__hkd_unwrap",     [T_ANY],           T_ANY],
    ["__hkd_on_complete",[T_ANY, T_ANY],    T_ANY],
  ];

  const dummySpan: SourceSpan = {
    start: { file: "<builtin>", line: 0, column: 0, offset: 0 },
    end:   { file: "<builtin>", line: 0, column: 0, offset: 0 },
  };

  for (const [name, params, ret] of builtins) {
    scope.define({
      name,
      type: makeFunction(params, ret),
      mutable: false,
      defined: true,
      used: true,   // builtins are always considered "used"
      declSpan: dummySpan,
      isFunction: true,
      isStruct: false,
    });
  }

  return scope;
}
