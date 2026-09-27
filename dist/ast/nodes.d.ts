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
export interface AstNode {
    span: SourceSpan;
}
export type TypeExpr = NamedTypeExpr | ArrayTypeExpr | FunctionTypeExpr | NullableTypeExpr;
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
export type Expr = IntLiteral | FloatLiteral | StringLiteral | BoolLiteral | NullLiteral | IdentExpr | BinaryExpr | UnaryExpr | CallExpr | IndexExpr | MemberExpr | AssignExpr | CompoundAssignExpr | ArrayExpr | ObjectExpr | FunctionExpr | IfExpr | BlockExpr | StructInitExpr | RangeExpr | CastExpr | MatchExpr | AwaitExpr;
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
export interface IdentExpr extends AstNode {
    kind: "IdentExpr";
    name: string;
}
export interface BinaryExpr extends AstNode {
    kind: "BinaryExpr";
    op: BinaryOp;
    left: Expr;
    right: Expr;
}
export type BinaryOp = "+" | "-" | "*" | "/" | "%" | "**" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "&&" | "||" | "&" | "|" | "^" | "<<" | ">>";
export interface UnaryExpr extends AstNode {
    kind: "UnaryExpr";
    op: UnaryOp;
    operand: Expr;
}
export type UnaryOp = "-" | "!" | "~";
export interface CallExpr extends AstNode {
    kind: "CallExpr";
    callee: Expr;
    typeArgs?: TypeExpr[];
    args: Expr[];
}
export interface IndexExpr extends AstNode {
    kind: "IndexExpr";
    object: Expr;
    index: Expr;
}
export interface MemberExpr extends AstNode {
    kind: "MemberExpr";
    object: Expr;
    property: string;
    optional: boolean;
}
export interface AssignExpr extends AstNode {
    kind: "AssignExpr";
    target: Expr;
    value: Expr;
}
export interface CompoundAssignExpr extends AstNode {
    kind: "CompoundAssignExpr";
    op: CompoundAssignOp;
    target: Expr;
    value: Expr;
}
export type CompoundAssignOp = "+=" | "-=" | "*=" | "/=" | "%=";
export interface ArrayExpr extends AstNode {
    kind: "ArrayExpr";
    elements: Expr[];
}
export interface ObjectExpr extends AstNode {
    kind: "ObjectExpr";
    fields: ObjectField[];
}
export interface ObjectField extends AstNode {
    key: string;
    value: Expr;
}
export interface FunctionExpr extends AstNode {
    kind: "FunctionExpr";
    isAsync?: boolean;
    typeParams?: string[];
    params: Param[];
    returnType: TypeExpr | null;
    body: BlockStmt;
}
export interface AwaitExpr extends AstNode {
    kind: "AwaitExpr";
    expr: Expr;
}
export interface IfExpr extends AstNode {
    kind: "IfExpr";
    condition: Expr;
    then: BlockStmt;
    else_: BlockStmt | IfExpr | null;
}
export interface BlockExpr extends AstNode {
    kind: "BlockExpr";
    body: Stmt[];
}
export interface StructInitExpr extends AstNode {
    kind: "StructInitExpr";
    name: string;
    fields: ObjectField[];
}
export interface RangeExpr extends AstNode {
    kind: "RangeExpr";
    start: Expr;
    end: Expr;
    inclusive: boolean;
}
export interface CastExpr extends AstNode {
    kind: "CastExpr";
    expr: Expr;
    targetType: TypeExpr;
}
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
export type Pattern = LiteralPattern | WildcardPattern | IdentPattern | ArrayPattern;
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
export type Stmt = VarDeclStmt | ConstDeclStmt | FunctionDeclStmt | StructDeclStmt | ImplBlockStmt | TraitDeclStmt | TypeAliasStmt | ReturnStmt | BreakStmt | ContinueStmt | IfStmt | WhileStmt | ForStmt | BlockStmt | ExprStmt | ImportStmt | ExportStmt | TestStmt | AssertStmt;
export interface VarDeclStmt extends AstNode {
    kind: "VarDeclStmt";
    name: string;
    typeAnnotation: TypeExpr | null;
    initializer: Expr | null;
    mutable: true;
}
export interface ConstDeclStmt extends AstNode {
    kind: "ConstDeclStmt";
    name: string;
    typeAnnotation: TypeExpr | null;
    initializer: Expr;
    mutable: false;
}
export interface FunctionDeclStmt extends AstNode {
    kind: "FunctionDeclStmt";
    name: string;
    isAsync?: boolean;
    typeParams?: string[];
    typeParamBounds?: Record<string, string>;
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
export interface ImplBlockStmt extends AstNode {
    kind: "ImplBlockStmt";
    traitName?: string;
    structName: string;
    methods: FunctionDeclStmt[];
}
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
export interface TypeAliasStmt extends AstNode {
    kind: "TypeAliasStmt";
    name: string;
    typeExpr: TypeExpr;
    exported: boolean;
}
export interface ReturnStmt extends AstNode {
    kind: "ReturnStmt";
    value: Expr | null;
}
export interface BreakStmt extends AstNode {
    kind: "BreakStmt";
}
export interface ContinueStmt extends AstNode {
    kind: "ContinueStmt";
}
export interface IfStmt extends AstNode {
    kind: "IfStmt";
    condition: Expr;
    then: BlockStmt;
    else_: BlockStmt | IfStmt | null;
}
export interface WhileStmt extends AstNode {
    kind: "WhileStmt";
    condition: Expr;
    body: BlockStmt;
}
export interface ForStmt extends AstNode {
    kind: "ForStmt";
    variable: string;
    iterable: Expr;
    body: BlockStmt;
}
export interface BlockStmt extends AstNode {
    kind: "BlockStmt";
    body: Stmt[];
}
export interface ExprStmt extends AstNode {
    kind: "ExprStmt";
    expr: Expr;
}
export interface ImportStmt extends AstNode {
    kind: "ImportStmt";
    specifiers: ImportSpecifier[];
    source: string;
    defaultName: string | null;
}
export interface ImportSpecifier extends AstNode {
    name: string;
    alias: string | null;
}
export interface ExportStmt extends AstNode {
    kind: "ExportStmt";
    declaration: FunctionDeclStmt | VarDeclStmt | ConstDeclStmt | StructDeclStmt | TraitDeclStmt | TypeAliasStmt;
}
export interface TestStmt extends AstNode {
    kind: "TestStmt";
    description: string;
    body: BlockStmt;
}
export interface AssertStmt extends AstNode {
    kind: "AssertStmt";
    condition: Expr;
    message: Expr | null;
}
export interface Program extends AstNode {
    kind: "Program";
    statements: Stmt[];
    fileName: string;
    features?: string[];
    edition?: "2026" | "2027";
}
//# sourceMappingURL=nodes.d.ts.map