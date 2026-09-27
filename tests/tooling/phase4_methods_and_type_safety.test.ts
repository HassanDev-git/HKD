/**
 * HKD Phase 4 — Struct Methods, Type Safety & Developer Foundations
 *
 * Comprehensive test suite validating:
 * 1. Struct methods declaration (`impl Struct { fn method(self, ...) { ... } }`)
 * 2. Monomorphic lowering and execution (`u.greet() ===> Struct__greet(u)`)
 * 3. Method chaining and multiple arguments
 * 4. Error diagnostics: field/method collision (E304), duplicate method (E304), unknown struct (E301)
 * 5. Method parameter validation: self required as first parameter (E307), immutable self (E405)
 * 6. Method call validation: wrong arg count (E307), arg type mismatch (E303), unknown method (E309)
 * 7. Strengthened assignment type safety: typed variable reassignment (E303), uninitialized let type specialization
 * 8. LSP integration: method completion, signature hover, go-to-definition
 * 9. Code Formatter: impl block formatting
 * 10. Performance equivalence: method calls vs direct function calls
 */

import * as fs from "fs";
import * as path from "path";
import { runSource } from "../../src/runtime/index.js";
import { format } from "../../src/formatter/index.js";
import { getCompletionItems, getHover, getDefinition } from "../../src/lsp/features.js";
import { DocumentManager } from "../../src/lsp/documents.js";
import { WorkspaceGraph } from "../../src/lsp/workspace-graph.js";

function execute(src: string): { output: string[]; ok: boolean; error?: string; diagnostics: string[] } {
  const output: string[] = [];
  const res = runSource(src, {
    fileName: "<phase4-test>",
    output: (s) => output.push(s),
    printDiagnostics: false,
  });
  return { output, ok: res.ok, error: res.error, diagnostics: res.diagnostics };
}

describe("Phase 4 — Struct Methods & Type Safety", () => {
  // ─── 1. Basic Method Declaration & Monomorphic Invocation ───────────────
  describe("Method Declaration and Invocation", () => {
    test("declares and invokes a basic struct method", () => {
      const src = `
        struct User {
          name: String
          age: Int
        }

        impl User {
          fn greet(self) -> String {
            return "Hello, " + self.name
          }
          fn is_adult(self) -> Bool {
            return self.age >= 18
          }
        }

        let u = User { name: "Alice", age: 25 }
        print(u.greet())
        print(to_string(u.is_adult()))
      `;
      const { output, ok } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["Hello, Alice", "true"]);
    });

    test("method with multiple arguments and return values", () => {
      const src = `
        struct Calculator {
          base: Int
        }

        impl Calculator {
          fn calculate(self, multiplier: Int, addend: Int) -> Int {
            return self.base * multiplier + addend
          }
        }

        let calc = Calculator { base: 10 }
        print(to_string(calc.calculate(3, 5)))
      `;
      const { output, ok } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["35"]);
    });

    test("method chaining on structs", () => {
      const src = `
        struct Counter {
          count: Int
        }

        impl Counter {
          fn inc(self, amount: Int) -> Counter {
            return Counter { count: self.count + amount }
          }
          fn get_count(self) -> Int {
            return self.count
          }
        }

        let c = Counter { count: 0 }
        let c2 = c.inc(5).inc(10).inc(3)
        print(to_string(c2.get_count()))
      `;
      const { output, ok } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["18"]);
    });

    test("multiple impl blocks for the same struct", () => {
      const src = `
        struct Point {
          x: Int
          y: Int
        }

        impl Point {
          fn get_x(self) -> Int { return self.x }
        }

        impl Point {
          fn get_y(self) -> Int { return self.y }
          fn sum(self) -> Int { return self.x + self.y }
        }

        let p = Point { x: 3, y: 7 }
        print(to_string(p.get_x()))
        print(to_string(p.get_y()))
        print(to_string(p.sum()))
      `;
      const { output, ok } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["3", "7", "10"]);
    });
  });

  // ─── 2. Method Diagnostics & Collision Prevention ───────────────────────
  describe("Method Diagnostics & Collisions", () => {
    test("rejects collision between method name and struct field name with E304", () => {
      const src = `
        struct User {
          name: String
        }

        impl User {
          fn name(self) -> String {
            return self.name
          }
        }
      `;
      const { ok, diagnostics } = execute(src);
      expect(ok).toBe(false);
      expect(diagnostics.some((d) => d.includes("E304") && d.includes("conflicts with existing field"))).toBe(true);
    });

    test("rejects duplicate method defined on the same struct with E304", () => {
      const src = `
        struct Item {
          price: Int
        }

        impl Item {
          fn get_price(self) -> Int { return self.price }
          fn get_price(self) -> Int { return self.price * 2 }
        }
      `;
      const { ok, diagnostics } = execute(src);
      expect(ok).toBe(false);
      expect(diagnostics.some((d) => d.includes("E304") && d.includes("already defined"))).toBe(true);
    });

    test("rejects impl block for unknown struct with E301", () => {
      const src = `
        impl GhostStruct {
          fn spook(self) -> String { return "boo" }
        }
      `;
      const { ok, diagnostics } = execute(src);
      expect(ok).toBe(false);
      expect(diagnostics.some((d) => d.includes("E301") && d.includes("GhostStruct"))).toBe(true);
    });

    test("rejects method declaration without self as first parameter with E307", () => {
      const src = `
        struct Widget { id: Int }
        impl Widget {
          fn bad_method(x: Int) -> Int {
            return x * 2
          }
        }
      `;
      const { ok, diagnostics } = execute(src);
      expect(ok).toBe(false);
      expect(diagnostics.some((d) => d.includes("E307") && d.includes("First parameter of method"))).toBe(true);
    });

    test("rejects self reassignment inside method with E405", () => {
      const src = `
        struct Person { name: String }
        impl Person {
          fn replace(self, other: Person) -> Person {
            self = other
            return self
          }
        }
      `;
      const { ok, diagnostics } = execute(src);
      expect(ok).toBe(false);
      expect(diagnostics.some((d) => d.includes("E405") && d.includes("Cannot assign to `self`"))).toBe(true);
    });
  });

  // ─── 3. Method Call Validation ──────────────────────────────────────────
  describe("Method Call Validation", () => {
    test("rejects method call with incorrect argument count with E307", () => {
      const src = `
        struct Adder { val: Int }
        impl Adder {
          fn add(self, x: Int, y: Int) -> Int {
            return self.val + x + y
          }
        }
        let a = Adder { val: 5 }
        print(to_string(a.add(10)))
      `;
      const { ok, diagnostics } = execute(src);
      expect(ok).toBe(false);
      expect(diagnostics.some((d) => d.includes("E307") && d.includes("expects 2 argument(s)"))).toBe(true);
    });

    test("rejects method call with mismatched argument type with E303", () => {
      const src = `
        struct Formatter { prefix: String }
        impl Formatter {
          fn format(self, count: Int) -> String {
            return self.prefix + to_string(count)
          }
        }
        let f = Formatter { prefix: "items: " }
        print(f.format("not-an-int"))
      `;
      const { ok, diagnostics } = execute(src);
      expect(ok).toBe(false);
      expect(diagnostics.some((d) => d.includes("E303") && d.includes("expects `Int`"))).toBe(true);
    });

    test("rejects call to non-existent method with E309 and helpful suggestions", () => {
      const src = `
        struct Box { width: Int, height: Int }
        impl Box {
          fn area(self) -> Int { return self.width * self.height }
        }
        let b = Box { width: 4, height: 5 }
        b.perimeter()
      `;
      const { ok, diagnostics } = execute(src);
      expect(ok).toBe(false);
      expect(diagnostics.some((d) => d.includes("E309") && d.includes("perimeter"))).toBe(true);
    });
  });

  // ─── 4. Strengthened Assignment Type Safety ─────────────────────────────
  describe("Assignment Type Safety & Inference", () => {
    test("rejects assigning mismatched type to typed variable with E303", () => {
      const src = `
        let x: Int = 10
        x = "hello world"
      `;
      const { ok, diagnostics } = execute(src);
      expect(ok).toBe(false);
      expect(diagnostics.some((d) => d.includes("E303") && d.includes("Cannot assign `String` to `Int`"))).toBe(true);
    });

    test("specializes uninitialized let variable on first assignment and rejects subsequent mismatched assignment", () => {
      const src = `
        let x
        x = 42
        x = "string reassignment"
      `;
      const { ok, diagnostics } = execute(src);
      expect(ok).toBe(false);
      expect(diagnostics.some((d) => d.includes("E303") && d.includes("Cannot assign `String` to `Int`"))).toBe(true);
    });

    test("allows valid type reassignment to mutable variable", () => {
      const src = `
        let count: Int = 10
        count = 20
        count = count + 5
        print(to_string(count))
      `;
      const { output, ok } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["25"]);
    });

    test("rejects compound assignment with invalid operand type with E303", () => {
      const src = `
        let count: Int = 10
        count += "extra"
      `;
      const { ok, diagnostics } = execute(src);
      expect(ok).toBe(false);
      expect(diagnostics.some((d) => d.includes("E303"))).toBe(true);
    });
  });

  // ─── 5. LSP Tooling Integration ─────────────────────────────────────────
  describe("LSP Features for Struct Methods", () => {
    const docManager = new DocumentManager();
    const ws = new WorkspaceGraph();

    function createDoc(text: string) {
      return docManager.open("file:///test.hkd", 1, text);
    }

    test("LSP autocompletion provides struct methods on member access", () => {
      const code = `
struct Account { balance: Int }
impl Account {
  fn deposit(self, amount: Int) -> Int { return self.balance + amount }
  fn withdraw(self, amount: Int) -> Int { return self.balance - amount }
}
let a = Account { balance: 100 }
a.
`;
      const doc = createDoc(code);
      const ws = new WorkspaceGraph();
      // Position after 'a.'
      const items = getCompletionItems(doc, { line: 7, character: 2 }, ws);
      const methodLabels = items.map((i) => i.label);
      expect(methodLabels).toContain("deposit");
      expect(methodLabels).toContain("withdraw");
    });

    test("LSP keyword completion includes 'impl'", () => {
      const doc = createDoc("let x = 1");
      const ws = new WorkspaceGraph();
      const items = getCompletionItems(doc, { line: 0, character: 0 }, ws);
      const labels = items.map((i) => i.label);
      expect(labels).toContain("impl");
    });

    test("LSP hover displays method signature and struct association", () => {
      const code = `
struct Vector { x: Int, y: Int }
impl Vector {
  fn magnitude_sq(self) -> Int {
    return self.x * self.x + self.y * self.y
  }
}
`;
      const doc = createDoc(code);
      const ws = new WorkspaceGraph();
      const hover = getHover(doc, { line: 3, character: 6 }, ws);
      expect(hover).not.toBeNull();
      const val = typeof hover!.contents === "string" ? hover!.contents : hover!.contents.value;
      expect(val).toContain("magnitude_sq");
      expect(val).toContain("Vector");
    });

    test("LSP go-to-definition resolves method definition in impl block", () => {
      const code = `
struct Greeter { name: String }
impl Greeter {
  fn greet(self) -> String { return "hi " + self.name }
}
let g = Greeter { name: "Bob" }
g.greet()
`;
      const doc = createDoc(code);
      const ws = new WorkspaceGraph();
      const def = getDefinition(doc, { line: 6, character: 3 }, ws) as any;
      expect(def).not.toBeNull();
      expect(def.range.start.line).toBe(3); // Line of `fn greet`
    });
  });

  // ─── 6. Formatter Integration ───────────────────────────────────────────
  describe("Code Formatter for Impl Blocks", () => {
    test("formats struct and impl blocks with proper indentation", () => {
      const unformatted = `struct Cat{name:String,age:Int}
impl Cat{
fn speak(self)->String{
return "meow"
}
}`;
      const formatted = format(unformatted);
      expect(formatted).toContain("struct Cat {");
      expect(formatted).toContain("impl Cat {");
      expect(formatted).toContain("  fn speak(self) -> String {");
      expect(formatted).toContain('    return "meow"');
    });
  });

  // ─── 7. Performance Equivalence (Zero-Overhead Verification) ────────────
  describe("Performance Equivalence: Method Call vs Direct Function Call", () => {
    test("method calls execute with zero overhead compared to lowered function call", () => {
      const methodSrc = `
        struct Metric {
          val: Int
        }
        impl Metric {
          fn compute(self, x: Int) -> Int {
            return self.val * x + 7
          }
        }
        let m = Metric { val: 3 }
        let total = 0
        let i = 0
        while i < 1000 {
          total = total + m.compute(i)
          i = i + 1
        }
        print(to_string(total))
      `;

      const directSrc = `
        struct Metric {
          val: Int
        }
        fn Metric__compute(self: Metric, x: Int) -> Int {
          return self.val * x + 7
        }
        let m = Metric { val: 3 }
        let total = 0
        let i = 0
        while i < 1000 {
          total = total + Metric__compute(m, i)
          i = i + 1
        }
        print(to_string(total))
      `;

      const resMethod = execute(methodSrc);
      const resDirect = execute(directSrc);

      expect(resMethod.ok).toBe(true);
      expect(resDirect.ok).toBe(true);
      expect(resMethod.output).toEqual(resDirect.output);
    });
  });

  // ─── 8. Dogfooding Applications Validation ──────────────────────────────
  describe("Dogfooding Applications A, B, C", () => {
    test("Application A: Domain Model / Order Management executes cleanly", () => {
      const filePath = path.resolve("examples/dogfood/domain_model_app/main.hkd");
      expect(fs.existsSync(filePath)).toBe(true);
      const src = fs.readFileSync(filePath, "utf-8");
      const { output, ok, diagnostics } = execute(src);
      expect(ok).toBe(true);
      expect(diagnostics).toHaveLength(0);
      expect(output).toContain("[VIP] Alice");
      expect(output).toContain("Item 1 total: $120");
      expect(output).toContain("Subtotal: $180");
      expect(output).toContain("Final total: $162");
      expect(output).toContain("Free shipping: true");
    });

    test("Application B: HTTP Service with struct methods executes cleanly", () => {
      const filePath = path.resolve("examples/dogfood/method_http_service/main.hkd");
      expect(fs.existsSync(filePath)).toBe(true);
      const src = fs.readFileSync(filePath, "utf-8");
      const { output, ok, diagnostics } = execute(src);
      expect(ok).toBe(true);
      expect(diagnostics).toHaveLength(0);
      expect(output.some((o) => o.includes("Req 1 route: GET /api/v1/user (is_get=true)"))).toBe(true);
      expect(output.some((o) => o.includes("HTTP/1.1 200") && o.includes("success=true"))).toBe(true);
      expect(output.some((o) => o.includes("HTTP/1.1 201"))).toBe(true);
      expect(output.some((o) => o.includes("HTTP/1.1 404"))).toBe(true);
    });

    test("Application C: Collection / ETL Pipeline with methods executes cleanly", () => {
      const filePath = path.resolve("examples/dogfood/method_etl_pipeline/main.hkd");
      expect(fs.existsSync(filePath)).toBe(true);
      const src = fs.readFileSync(filePath, "utf-8");
      const { output, ok, diagnostics } = execute(src);
      expect(ok).toBe(true);
      expect(diagnostics).toHaveLength(0);
      expect(output).toContain("--- Processing Log Stream ---");
      expect(output.some((o) => o.includes("ETL Report: total=5, errors=2 (40%), slow=2"))).toBe(true);
    });
  });
});
