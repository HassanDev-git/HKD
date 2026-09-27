import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { format } from "../../src/formatter/index.js";
import { ErrorReporter } from "../../src/errors/index.js";

function formatSource(source: string): string {
  const reporter = new ErrorReporter(source, "test.hkd");
  const lexer = new Lexer(source, "test.hkd", reporter);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, source, "test.hkd", reporter);
  const ast = parser.parse();
  if (reporter.hasErrors()) {
    throw new Error("Syntax errors: " + reporter.format());
  }
  return format(ast);
}

describe("HKD Formatter Idempotency", () => {
  it("should be idempotent on variable and function declarations", () => {
    const original = `
let x: int = 5
const y = 3.14
fn add(a: int, b: int) -> int {
    return a + b
}
`;
    const first = formatSource(original);
    const second = formatSource(first);
    expect(second).toBe(first);
  });

  it("should format structures and assignments cleanly", () => {
    const original = `
struct Point {
    x: int
    y: int
}
let p = Point { x: 10, y: 20 }
`;
    const first = formatSource(original);
    const second = formatSource(first);
    expect(second).toBe(first);
  });
});
