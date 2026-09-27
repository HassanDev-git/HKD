/**
 * HKD AST Visitor
 *
 * Generic visitor pattern for traversing and transforming the AST.
 * Both the semantic analyser, bytecode compiler, formatter, and linter
 * use this visitor rather than re-implementing traversal logic.
 */
import * as N from "./nodes.js";
/**
 * Implement this interface to visit every node type.
 * Return a value of type R from each visitor method.
 */
export interface Visitor<R = void> {
    visitProgram(node: N.Program): R;
    visitVarDeclStmt(node: N.VarDeclStmt): R;
    visitConstDeclStmt(node: N.ConstDeclStmt): R;
    visitFunctionDeclStmt(node: N.FunctionDeclStmt): R;
    visitStructDeclStmt(node: N.StructDeclStmt): R;
    visitImplBlockStmt(node: N.ImplBlockStmt): R;
    visitTraitDeclStmt(node: N.TraitDeclStmt): R;
    visitTypeAliasStmt(node: N.TypeAliasStmt): R;
    visitReturnStmt(node: N.ReturnStmt): R;
    visitBreakStmt(node: N.BreakStmt): R;
    visitContinueStmt(node: N.ContinueStmt): R;
    visitIfStmt(node: N.IfStmt): R;
    visitWhileStmt(node: N.WhileStmt): R;
    visitForStmt(node: N.ForStmt): R;
    visitBlockStmt(node: N.BlockStmt): R;
    visitExprStmt(node: N.ExprStmt): R;
    visitImportStmt(node: N.ImportStmt): R;
    visitExportStmt(node: N.ExportStmt): R;
    visitTestStmt(node: N.TestStmt): R;
    visitAssertStmt(node: N.AssertStmt): R;
    visitIntLiteral(node: N.IntLiteral): R;
    visitFloatLiteral(node: N.FloatLiteral): R;
    visitStringLiteral(node: N.StringLiteral): R;
    visitBoolLiteral(node: N.BoolLiteral): R;
    visitNullLiteral(node: N.NullLiteral): R;
    visitIdentExpr(node: N.IdentExpr): R;
    visitBinaryExpr(node: N.BinaryExpr): R;
    visitUnaryExpr(node: N.UnaryExpr): R;
    visitCallExpr(node: N.CallExpr): R;
    visitIndexExpr(node: N.IndexExpr): R;
    visitMemberExpr(node: N.MemberExpr): R;
    visitAssignExpr(node: N.AssignExpr): R;
    visitCompoundAssignExpr(node: N.CompoundAssignExpr): R;
    visitArrayExpr(node: N.ArrayExpr): R;
    visitObjectExpr(node: N.ObjectExpr): R;
    visitFunctionExpr(node: N.FunctionExpr): R;
    visitIfExpr(node: N.IfExpr): R;
    visitBlockExpr(node: N.BlockExpr): R;
    visitStructInitExpr(node: N.StructInitExpr): R;
    visitRangeExpr(node: N.RangeExpr): R;
    visitCastExpr(node: N.CastExpr): R;
    visitMatchExpr(node: N.MatchExpr): R;
    visitAwaitExpr(node: N.AwaitExpr): R;
}
export declare function visitStmt<R>(visitor: Visitor<R>, stmt: N.Stmt): R;
export declare function visitExpr<R>(visitor: Visitor<R>, expr: N.Expr): R;
export declare abstract class BaseVisitor<R = void> implements Visitor<R> {
    protected abstract defaultResult(): R;
    protected abstract combineResults(a: R, b: R): R;
    visitProgram(node: N.Program): R;
    visitVarDeclStmt(node: N.VarDeclStmt): R;
    visitConstDeclStmt(node: N.ConstDeclStmt): R;
    visitFunctionDeclStmt(node: N.FunctionDeclStmt): R;
    visitStructDeclStmt(_node: N.StructDeclStmt): R;
    visitImplBlockStmt(node: N.ImplBlockStmt): R;
    visitTraitDeclStmt(_node: N.TraitDeclStmt): R;
    visitTypeAliasStmt(_node: N.TypeAliasStmt): R;
    visitReturnStmt(node: N.ReturnStmt): R;
    visitBreakStmt(_node: N.BreakStmt): R;
    visitContinueStmt(_node: N.ContinueStmt): R;
    visitIfStmt(node: N.IfStmt): R;
    visitWhileStmt(node: N.WhileStmt): R;
    visitForStmt(node: N.ForStmt): R;
    visitBlockStmt(node: N.BlockStmt): R;
    visitExprStmt(node: N.ExprStmt): R;
    visitImportStmt(_node: N.ImportStmt): R;
    visitExportStmt(node: N.ExportStmt): R;
    visitTestStmt(node: N.TestStmt): R;
    visitAssertStmt(node: N.AssertStmt): R;
    visitIntLiteral(_node: N.IntLiteral): R;
    visitFloatLiteral(_node: N.FloatLiteral): R;
    visitStringLiteral(_node: N.StringLiteral): R;
    visitBoolLiteral(_node: N.BoolLiteral): R;
    visitNullLiteral(_node: N.NullLiteral): R;
    visitIdentExpr(_node: N.IdentExpr): R;
    visitBinaryExpr(node: N.BinaryExpr): R;
    visitUnaryExpr(node: N.UnaryExpr): R;
    visitCallExpr(node: N.CallExpr): R;
    visitIndexExpr(node: N.IndexExpr): R;
    visitMemberExpr(node: N.MemberExpr): R;
    visitAssignExpr(node: N.AssignExpr): R;
    visitCompoundAssignExpr(node: N.CompoundAssignExpr): R;
    visitArrayExpr(node: N.ArrayExpr): R;
    visitObjectExpr(node: N.ObjectExpr): R;
    visitFunctionExpr(node: N.FunctionExpr): R;
    visitIfExpr(node: N.IfExpr): R;
    visitBlockExpr(node: N.BlockExpr): R;
    visitStructInitExpr(node: N.StructInitExpr): R;
    visitRangeExpr(node: N.RangeExpr): R;
    visitCastExpr(node: N.CastExpr): R;
    visitMatchExpr(node: N.MatchExpr): R;
    visitAwaitExpr(node: N.AwaitExpr): R;
}
//# sourceMappingURL=visitor.d.ts.map