import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { lint } from "../../src/linter/index.js";
import { ErrorReporter } from "../../src/errors/index.js";

function getLintIssues(source: string, ignored = new Set<string>()): any[] {
  const reporter = new ErrorReporter(source, "test.hkd");
  const lexer = new Lexer(source, "test.hkd", reporter);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, source, "test.hkd", reporter);
  const ast = parser.parse();
  return lint(ast, ignored);
}

describe("HKD Linter Diagnostics", () => {
  it("should warn about unused variables (L001)", () => {
    const source = "let x = 10\n";
    const issues = getLintIssues(source);
    expect(issues.some(i => i.code === "L001")).toBe(true);
  });

  it("should warn about unreachable code (L002)", () => {
    const source = `
fn my_func() {
    return 1
    let y = 2
}
`;
    const issues = getLintIssues(source);
    expect(issues.some(i => i.code === "L002")).toBe(true);
  });

  it("should allow ignoring warnings via ignoredCodes", () => {
    const source = "let x = 10\n";
    const issues = getLintIssues(source, new Set(["L001"]));
    expect(issues.some(i => i.code === "L001")).toBe(false);
  });

  it("should fix unused variables by prefixing them with underscore", () => {
    const source = "let x = 10\n";
    const issues = getLintIssues(source);
    const fixed = require("../../src/cli/main.js").applyLintFixes(source, issues);
    expect(fixed.trim()).toBe("let _x = 10");
  });
});
