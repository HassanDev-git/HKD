/**
 * Parser Test Suite
 */

import { Lexer } from "../../src/lexer/lexer";
import { Parser } from "../../src/parser/parser";
import { ErrorReporter } from "../../src/errors/index";
import * as N from "../../src/ast/nodes";

function parseSource(source: string): { ast: N.Program; reporter: ErrorReporter } {
  const reporter = new ErrorReporter(source, "<test>");
  const lexer = new Lexer(source, "<test>", reporter);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, source, "<test>", reporter);
  const ast = parser.parse();
  return { ast, reporter };
}

function firstStmt(source: string): N.Stmt {
  const { ast } = parseSource(source);
  return ast.statements[0];
}

describe("Parser — Variable Declarations", () => {
  test("let with initializer", () => {
    const stmt = firstStmt("let x = 10") as N.VarDeclStmt;
    expect(stmt.kind).toBe("VarDeclStmt");
    expect(stmt.name).toBe("x");
    expect(stmt.mutable).toBe(true);
    const init = stmt.initializer as N.IntLiteral;
    expect(init.value).toBe(10);
  });

  test("const declaration", () => {
    const stmt = firstStmt("const PI = 3.14") as N.ConstDeclStmt;
    expect(stmt.kind).toBe("ConstDeclStmt");
    expect(stmt.name).toBe("PI");
    expect(stmt.mutable).toBe(false);
    const init = stmt.initializer as N.FloatLiteral;
    expect(init.value).toBeCloseTo(3.14);
  });

  test("let with type annotation", () => {
    const stmt = firstStmt("let age: Int = 20") as N.VarDeclStmt;
    expect(stmt.typeAnnotation).not.toBeNull();
    const ta = stmt.typeAnnotation as N.NamedTypeExpr;
    expect(ta.name).toBe("Int");
  });

  test("let without initializer", () => {
    const stmt = firstStmt("let x") as N.VarDeclStmt;
    expect(stmt.initializer).toBeNull();
  });
});

describe("Parser — Function Declarations", () => {
  test("simple function", () => {
    const stmt = firstStmt("fn greet() { }") as N.FunctionDeclStmt;
    expect(stmt.kind).toBe("FunctionDeclStmt");
    expect(stmt.name).toBe("greet");
    expect(stmt.params).toHaveLength(0);
  });

  test("function with parameters", () => {
    const stmt = firstStmt("fn add(a, b) { }") as N.FunctionDeclStmt;
    expect(stmt.params).toHaveLength(2);
    expect(stmt.params[0].name).toBe("a");
    expect(stmt.params[1].name).toBe("b");
  });

  test("function with typed parameters and return type", () => {
    const stmt = firstStmt("fn add(a: Int, b: Int) -> Int { }") as N.FunctionDeclStmt;
    expect(stmt.params[0].typeAnnotation).not.toBeNull();
    expect(stmt.returnType).not.toBeNull();
    const rt = stmt.returnType as N.NamedTypeExpr;
    expect(rt.name).toBe("Int");
  });

  test("function with body", () => {
    const stmt = firstStmt("fn double(x) { return x * 2 }") as N.FunctionDeclStmt;
    expect(stmt.body.body).toHaveLength(1);
    const ret = stmt.body.body[0] as N.ReturnStmt;
    expect(ret.kind).toBe("ReturnStmt");
  });
});

describe("Parser — Expressions", () => {
  test("integer literal", () => {
    const stmt = firstStmt("42") as N.ExprStmt;
    const expr = stmt.expr as N.IntLiteral;
    expect(expr.kind).toBe("IntLiteral");
    expect(expr.value).toBe(42);
  });

  test("float literal", () => {
    const stmt = firstStmt("3.14") as N.ExprStmt;
    const expr = stmt.expr as N.FloatLiteral;
    expect(expr.kind).toBe("FloatLiteral");
    expect(expr.value).toBeCloseTo(3.14);
  });

  test("string literal", () => {
    const stmt = firstStmt('"hello"') as N.ExprStmt;
    const expr = stmt.expr as N.StringLiteral;
    expect(expr.kind).toBe("StringLiteral");
    expect(expr.value).toBe("hello");
  });

  test("boolean true", () => {
    const stmt = firstStmt("true") as N.ExprStmt;
    const expr = stmt.expr as N.BoolLiteral;
    expect(expr.value).toBe(true);
  });

  test("null literal", () => {
    const stmt = firstStmt("null") as N.ExprStmt;
    expect(stmt.expr.kind).toBe("NullLiteral");
  });

  test("identifier expression", () => {
    const stmt = firstStmt("myVar") as N.ExprStmt;
    const expr = stmt.expr as N.IdentExpr;
    expect(expr.kind).toBe("IdentExpr");
    expect(expr.name).toBe("myVar");
  });

  test("binary addition", () => {
    const stmt = firstStmt("1 + 2") as N.ExprStmt;
    const expr = stmt.expr as N.BinaryExpr;
    expect(expr.kind).toBe("BinaryExpr");
    expect(expr.op).toBe("+");
    expect((expr.left as N.IntLiteral).value).toBe(1);
    expect((expr.right as N.IntLiteral).value).toBe(2);
  });

  test("operator precedence: 1 + 2 * 3", () => {
    const stmt = firstStmt("1 + 2 * 3") as N.ExprStmt;
    const expr = stmt.expr as N.BinaryExpr;
    // Should be 1 + (2 * 3)
    expect(expr.op).toBe("+");
    expect((expr.right as N.BinaryExpr).op).toBe("*");
  });

  test("unary negation", () => {
    const stmt = firstStmt("-x") as N.ExprStmt;
    const expr = stmt.expr as N.UnaryExpr;
    expect(expr.kind).toBe("UnaryExpr");
    expect(expr.op).toBe("-");
  });

  test("function call", () => {
    const stmt = firstStmt("foo(1, 2)") as N.ExprStmt;
    const expr = stmt.expr as N.CallExpr;
    expect(expr.kind).toBe("CallExpr");
    expect(expr.args).toHaveLength(2);
  });

  test("array literal", () => {
    const stmt = firstStmt("[1, 2, 3]") as N.ExprStmt;
    const expr = stmt.expr as N.ArrayExpr;
    expect(expr.kind).toBe("ArrayExpr");
    expect(expr.elements).toHaveLength(3);
  });

  test("index expression", () => {
    const stmt = firstStmt("arr[0]") as N.ExprStmt;
    const expr = stmt.expr as N.IndexExpr;
    expect(expr.kind).toBe("IndexExpr");
  });

  test("member access", () => {
    const stmt = firstStmt("obj.field") as N.ExprStmt;
    const expr = stmt.expr as N.MemberExpr;
    expect(expr.kind).toBe("MemberExpr");
    expect(expr.property).toBe("field");
    expect(expr.optional).toBe(false);
  });

  test("optional member access", () => {
    const stmt = firstStmt("obj?.field") as N.ExprStmt;
    const expr = stmt.expr as N.MemberExpr;
    expect(expr.optional).toBe(true);
  });
});

describe("Parser — Control Flow", () => {
  test("if statement", () => {
    const stmt = firstStmt("if x > 0 { print(x) }") as N.IfStmt;
    expect(stmt.kind).toBe("IfStmt");
    expect(stmt.else_).toBeNull();
  });

  test("if-else statement", () => {
    const stmt = firstStmt("if x > 0 { return 1 } else { return 0 }") as N.IfStmt;
    expect(stmt.else_).not.toBeNull();
    expect(stmt.else_?.kind).toBe("BlockStmt");
  });

  test("if-else-if chain", () => {
    const stmt = firstStmt("if a { } else if b { } else { }") as N.IfStmt;
    expect(stmt.else_?.kind).toBe("IfStmt");
  });

  test("while loop", () => {
    const stmt = firstStmt("while i < 10 { i = i + 1 }") as N.WhileStmt;
    expect(stmt.kind).toBe("WhileStmt");
  });

  test("for loop", () => {
    const stmt = firstStmt("for item in items { print(item) }") as N.ForStmt;
    expect(stmt.kind).toBe("ForStmt");
    expect(stmt.variable).toBe("item");
  });

  test("return statement", () => {
    const stmt = firstStmt("return 42") as N.ReturnStmt;
    expect(stmt.kind).toBe("ReturnStmt");
    const val = stmt.value as N.IntLiteral;
    expect(val.value).toBe(42);
  });

  test("break statement", () => {
    const stmt = firstStmt("break") as N.BreakStmt;
    expect(stmt.kind).toBe("BreakStmt");
  });

  test("continue statement", () => {
    const stmt = firstStmt("continue") as N.ContinueStmt;
    expect(stmt.kind).toBe("ContinueStmt");
  });
});

describe("Parser — Import/Export", () => {
  test("bare import", () => {
    const stmt = firstStmt("import math") as N.ImportStmt;
    expect(stmt.kind).toBe("ImportStmt");
    expect(stmt.defaultName).toBe("math");
    expect(stmt.source).toBe("math");
  });

  test("import with from", () => {
    const stmt = firstStmt('import math from "std.math"') as N.ImportStmt;
    expect(stmt.defaultName).toBe("math");
    expect(stmt.source).toBe("std.math");
  });

  test("named import", () => {
    const stmt = firstStmt('import { add, sub } from "math"') as N.ImportStmt;
    expect(stmt.specifiers).toHaveLength(2);
    expect(stmt.specifiers[0].name).toBe("add");
    expect(stmt.specifiers[1].name).toBe("sub");
  });
});

describe("Parser — Struct Declarations", () => {
  test("struct with fields", () => {
    const stmt = firstStmt("struct User { name: String\n age: Int }") as N.StructDeclStmt;
    expect(stmt.kind).toBe("StructDeclStmt");
    expect(stmt.name).toBe("User");
    expect(stmt.fields).toHaveLength(2);
    expect(stmt.fields[0].name).toBe("name");
    expect(stmt.fields[1].name).toBe("age");
  });
});

describe("Parser — Error Recovery", () => {
  test("parser recovers after bad expression", () => {
    const { ast, reporter } = parseSource("let x = \nlet y = 5");
    expect(reporter.hasErrors()).toBe(true);
    // Should still parse y despite x being malformed
    const names = ast.statements
      .filter((s) => s.kind === "VarDeclStmt")
      .map((s) => (s as N.VarDeclStmt).name);
    expect(names).toContain("y");
  });
});
