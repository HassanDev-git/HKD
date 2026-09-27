/**
 * HKD Abstract Syntax Tree (AST) Node Definitions
 *
 * The AST is the canonical in-memory representation of an HKD program.
 * Every node carries a SourceSpan for error reporting and tooling.
 *
 * Design principles:
 *  - All nodes are plain data (no methods) — behaviour lives in visitors
 *  - Discriminated unions via `kind` string literals
 *  - Type annotations are optional (for gradual typing support)
 */

import { SourceSpan } from "../errors/index.js";

// ─── Base ─────────────────────────────────────────────────────────────────────

export interface AstNode {
  span: SourceSpan;
}

// ─── Type Expressions ─────────────────────────────────────────────────────────

export type TypeExpr =
  | NamedTypeExpr
  | ArrayTypeExpr
  | FunctionTypeExpr
  | NullableTypeExpr;

export interface NamedTypeExpr extends AstNode {
  kind: "NamedType";
  name: string;
}

export interface ArrayTypeExpr extends AstNode {
  kind: "ArrayType";
  elementType: TypeExpr;
}

export interface FunctionTypeExpr extends AstNode {
  kind: "FunctionType";
  params: TypeExpr[];
  returnType: TypeExpr | null;
}

export interface NullableTypeExpr extends AstNode {
  kind: "NullableType";
  inner: TypeExpr;
}

// ─── Expressions ──────────────────────────────────────────────────────────────

export type Expr =
  | IntLiteral
  | FloatLiteral
  | StringLiteral
  | BoolLiteral
  | NullLiteral
  | IdentExpr
  | BinaryExpr
  | UnaryExpr
  | CallExpr
  | IndexExpr
  | MemberExpr
  | AssignExpr
  | CompoundAssignExpr
  | ArrayExpr
  | ObjectExpr
  | FunctionExpr        // anonymous fn
  | IfExpr              // if as expression (ternary-style blocks)
  | BlockExpr           // { ... } returning last value
  | StructInitExpr      // User { name: "Hassan", age: 20 }
  | RangeExpr           // 0..10
  | CastExpr            // expr as Type
  | MatchExpr           // match value { pattern => result }
  | AwaitExpr;          // await expr

// Literals
export interface IntLiteral extends AstNode {
  kind: "IntLiteral";
  value: number;
  raw: string;
}

export interface FloatLiteral extends AstNode {
  kind: "FloatLiteral";
  value: number;
  raw: string;
}

export interface StringLiteral extends AstNode {
  kind: "StringLiteral";
  value: string;
}

export interface BoolLiteral extends AstNode {
  kind: "BoolLiteral";
  value: boolean;
}

export interface NullLiteral extends AstNode {
  kind: "NullLiteral";
}

// Identifier reference
export interface IdentExpr extends AstNode {
  kind: "IdentExpr";
  name: string;
}

// Binary: a + b, a == b, a && b, etc.
export interface BinaryExpr extends AstNode {
  kind: "BinaryExpr";
  op: BinaryOp;
  left: Expr;
  right: Expr;
}

export type BinaryOp =
  | "+" | "-" | "*" | "/" | "%" | "**"
  | "==" | "!=" | "<" | "<=" | ">" | ">="
  | "&&" | "||"
  | "&" | "|" | "^" | "<<" | ">>";

// Unary: -x, !x, ~x
export interface UnaryExpr extends AstNode {
  kind: "UnaryExpr";
  op: UnaryOp;
  operand: Expr;
}

export type UnaryOp = "-" | "!" | "~";

// Function call: foo(a, b) or foo<T>(a, b)
export interface CallExpr extends AstNode {
  kind: "CallExpr";
  callee: Expr;
  typeArgs?: TypeExpr[];
  args: Expr[];
}

// Index: arr[i]
export interface IndexExpr extends AstNode {
  kind: "IndexExpr";
  object: Expr;
  index: Expr;
}

// Member access: obj.field, obj?.field
export interface MemberExpr extends AstNode {
  kind: "MemberExpr";
  object: Expr;
  property: string;
  optional: boolean; // ?.
}

// Assignment: x = expr
export interface AssignExpr extends AstNode {
  kind: "AssignExpr";
  target: Expr;    // must be IdentExpr | IndexExpr | MemberExpr
  value: Expr;
}

// Compound assignment: x += expr
export interface CompoundAssignExpr extends AstNode {
  kind: "CompoundAssignExpr";
  op: CompoundAssignOp;
  target: Expr;
  value: Expr;
}

export type CompoundAssignOp = "+=" | "-=" | "*=" | "/=" | "%=";

// Array literal: [1, 2, 3]
export interface ArrayExpr extends AstNode {
  kind: "ArrayExpr";
  elements: Expr[];
}

// Object literal: { key: value, ... }
export interface ObjectExpr extends AstNode {
  kind: "ObjectExpr";
  fields: ObjectField[];
}

export interface ObjectField extends AstNode {
  key: string;
  value: Expr;
}

// Anonymous function expression: fn(a, b) { ... }
export interface FunctionExpr extends AstNode {
  kind: "FunctionExpr";
  isAsync?: boolean;
  typeParams?: string[];
  params: Param[];
  returnType: TypeExpr | null;
  body: BlockStmt;
}

// Await expression: await expr
export interface AwaitExpr extends AstNode {
  kind: "AwaitExpr";
  expr: Expr;
}

// If expression: if cond { ... } else { ... }
export interface IfExpr extends AstNode {
  kind: "IfExpr";
  condition: Expr;
  then: BlockStmt;
  else_: BlockStmt | IfExpr | null;
}

// Block expression: { stmt; stmt; expr }
export interface BlockExpr extends AstNode {
  kind: "BlockExpr";
  body: Stmt[];
}

// Struct initializer: User { name: "Hassan" }
export interface StructInitExpr extends AstNode {
  kind: "StructInitExpr";
  name: string;
  fields: ObjectField[];
}

// Range: 0..10
export interface RangeExpr extends AstNode {
  kind: "RangeExpr";
  start: Expr;
  end: Expr;
  inclusive: boolean; // ..= is inclusive
}

// Cast: expr as Type
export interface CastExpr extends AstNode {
  kind: "CastExpr";
  expr: Expr;
  targetType: TypeExpr;
}

// Pattern matching: match scrutinee { arm, ... }
export interface MatchExpr extends AstNode {
  kind: "MatchExpr";
  scrutinee: Expr;
  arms: MatchArm[];
}

export interface MatchArm extends AstNode {
  kind: "MatchArm";
  pattern: Pattern;
  guard?: Expr | null;
  body: Expr | BlockStmt;
}

export type Pattern =
  | LiteralPattern
  | WildcardPattern
  | IdentPattern
  | ArrayPattern;

export interface LiteralPattern extends AstNode {
  kind: "LiteralPattern";
  literal: IntLiteral | FloatLiteral | StringLiteral | BoolLiteral | NullLiteral;
}

export interface WildcardPattern extends AstNode {
  kind: "WildcardPattern";
}

export interface IdentPattern extends AstNode {
  kind: "IdentPattern";
  name: string;
}

export interface ArrayPattern extends AstNode {
  kind: "ArrayPattern";
  elements: Pattern[];
}

// ─── Statements ───────────────────────────────────────────────────────────────

export type Stmt =
  | VarDeclStmt
  | ConstDeclStmt
  | FunctionDeclStmt
  | StructDeclStmt
  | ImplBlockStmt
  | TraitDeclStmt
  | TypeAliasStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt
  | IfStmt
  | WhileStmt
  | ForStmt
  | BlockStmt
  | ExprStmt
  | ImportStmt
  | ExportStmt
  | TestStmt
  | AssertStmt;

// let x = expr  /  let x: Type = expr
export interface VarDeclStmt extends AstNode {
  kind: "VarDeclStmt";
  name: string;
  typeAnnotation: TypeExpr | null;
  initializer: Expr | null;
  mutable: true;
}

// const x = expr
export interface ConstDeclStmt extends AstNode {
  kind: "ConstDeclStmt";
  name: string;
  typeAnnotation: TypeExpr | null;
  initializer: Expr;
  mutable: false;
}

// fn name(params) -> ReturnType { body }
export interface FunctionDeclStmt extends AstNode {
  kind: "FunctionDeclStmt";
  name: string;
  isAsync?: boolean;
  typeParams?: string[];
  typeParamBounds?: Record<string, string>; // e.g. { T: "Printable" }
  params: Param[];
  returnType: TypeExpr | null;
  body: BlockStmt;
  exported: boolean;
}

export interface Param extends AstNode {
  name: string;
  typeAnnotation: TypeExpr | null;
  defaultValue: Expr | null;
}

// struct Name { field: Type, ... }
export interface StructDeclStmt extends AstNode {
  kind: "StructDeclStmt";
  name: string;
  fields: StructField[];
  exported: boolean;
}

export interface StructField extends AstNode {
  name: string;
  typeAnnotation: TypeExpr;
  defaultValue: Expr | null;
}

// impl StructName { ... } or impl TraitName for StructName { ... }
export interface ImplBlockStmt extends AstNode {
  kind: "ImplBlockStmt";
  traitName?: string;
  structName: string;
  methods: FunctionDeclStmt[];
}

// trait TraitName { fn method(self, ...) -> Type, ... }
export interface TraitDeclStmt extends AstNode {
  kind: "TraitDeclStmt";
  name: string;
  methods: TraitMethodDecl[];
  exported: boolean;
}

export interface TraitMethodDecl extends AstNode {
  kind: "TraitMethodDecl";
  name: string;
  params: Param[];
  returnType: TypeExpr | null;
}

// type Alias = Type
export interface TypeAliasStmt extends AstNode {
  kind: "TypeAliasStmt";
  name: string;
  typeExpr: TypeExpr;
  exported: boolean;
}

// return expr?
export interface ReturnStmt extends AstNode {
  kind: "ReturnStmt";
  value: Expr | null;
}

// break
export interface BreakStmt extends AstNode {
  kind: "BreakStmt";
}

// continue
export interface ContinueStmt extends AstNode {
  kind: "ContinueStmt";
}

// if cond { ... } else { ... }
export interface IfStmt extends AstNode {
  kind: "IfStmt";
  condition: Expr;
  then: BlockStmt;
  else_: BlockStmt | IfStmt | null;
}

// while cond { ... }
export interface WhileStmt extends AstNode {
  kind: "WhileStmt";
  condition: Expr;
  body: BlockStmt;
}

// for item in iterable { ... }
export interface ForStmt extends AstNode {
  kind: "ForStmt";
  variable: string;
  iterable: Expr;
  body: BlockStmt;
}

// { stmt; stmt; ... }
export interface BlockStmt extends AstNode {
  kind: "BlockStmt";
  body: Stmt[];
}

// expr; (expression as statement)
export interface ExprStmt extends AstNode {
  kind: "ExprStmt";
  expr: Expr;
}

// import math
// import { add, sub } from "math"
// import math from "std.math"
export interface ImportStmt extends AstNode {
  kind: "ImportStmt";
  specifiers: ImportSpecifier[];
  source: string;       // module path string
  defaultName: string | null;    // import foo from "..."
}

export interface ImportSpecifier extends AstNode {
  name: string;
  alias: string | null;  // import { x as y }
}

// export fn, export let, etc.
export interface ExportStmt extends AstNode {
  kind: "ExportStmt";
  declaration: FunctionDeclStmt | VarDeclStmt | ConstDeclStmt | StructDeclStmt | TraitDeclStmt | TypeAliasStmt;
}

// test "description" { ... }
export interface TestStmt extends AstNode {
  kind: "TestStmt";
  description: string;
  body: BlockStmt;
}

// assert(condition)
export interface AssertStmt extends AstNode {
  kind: "AssertStmt";
  condition: Expr;
  message: Expr | null;
}

// ─── Program (root) ───────────────────────────────────────────────────────────

export interface Program extends AstNode {
  kind: "Program";
  statements: Stmt[];
  fileName: string;
  features?: string[];
  edition?: "2026" | "2027";
}
