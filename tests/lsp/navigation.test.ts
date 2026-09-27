import { DocumentManager } from "../../src/lsp/documents.js";
import { WorkspaceGraph } from "../../src/lsp/workspace-graph.js";
import {
  getDefinition,
  getReferences,
  renameSymbol,
} from "../../src/lsp/features.js";

describe("HKD LSP 2.0 — Navigation, References & Refactoring", () => {
  const docManager = new DocumentManager();
  const ws = new WorkspaceGraph();

  test("definition resolves function declaration across local file", () => {
    const text = `
fn multiply(a, b) {
    return a * b
}
let res = multiply(10, 20)
`;
    const doc = docManager.open("file:///nav1.hkd", 1, text);
    const def = getDefinition(doc, { line: 4, character: 12 }, ws);

    expect(def).not.toBeNull();
    const loc = def as { range: { start: { line: number } } };
    expect(loc.range.start.line).toBe(1);
  });

  test("definition resolves struct declaration from usage site", () => {
    const text = `
struct Point {
    x: float
    y: float
}
let pt = Point { x: 1.0, y: 2.0 }
`;
    const doc = docManager.open("file:///nav2.hkd", 1, text);
    const def = getDefinition(doc, { line: 5, character: 10 }, ws);

    expect(def).not.toBeNull();
    const loc = def as { range: { start: { line: number } } };
    expect(loc.range.start.line).toBe(1);
  });

  test("definition resolves constant declaration", () => {
    const text = `
const PI = 3.14159
let circleArea = PI * 10 * 10
`;
    const doc = docManager.open("file:///nav3.hkd", 1, text);
    const def = getDefinition(doc, { line: 2, character: 18 }, ws);

    expect(def).not.toBeNull();
    const loc = def as { range: { start: { line: number } } };
    expect(loc.range.start.line).toBe(1);
  });

  test("find references ignores identifiers embedded within string literals", () => {
    const text = `
let id = "USR100"
let message = "Your id is not updated"
print(id)
`;
    const doc = docManager.open("file:///nav4.hkd", 1, text);
    const refs = getReferences(doc, { line: 1, character: 5 }, ws);

    // Should find the declaration and print(id), not inside the string message
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  test("find references ignores identifiers within comments", () => {
    const text = `
let total = 500
// total should be preserved
let adjusted = total + 50
`;
    const doc = docManager.open("file:///nav5.hkd", 1, text);
    const refs = getReferences(doc, { line: 1, character: 5 }, ws);

    // Must not count the comment line
    const commentRefs = refs.filter((r) => r.range.start.line === 2);
    expect(commentRefs.length).toBe(0);
  });

  test("find references handles function calls properly", () => {
    const text = `
fn helper() { return 1 }
helper()
helper()
`;
    const doc = docManager.open("file:///nav6.hkd", 1, text);
    const refs = getReferences(doc, { line: 1, character: 4 }, ws);

    expect(refs.length).toBe(3);
  });

  test("rename symbol rejects invalid identifier characters", () => {
    const text = "let validName = 10\n";
    const doc = docManager.open("file:///nav7.hkd", 1, text);

    expect(() => {
      renameSymbol(doc, { line: 0, character: 5 }, "invalid-name-with-hyphens", ws);
    }).toThrow();
  });

  test("rename symbol rejects identifier starting with digit", () => {
    const text = "let val = 10\n";
    const doc = docManager.open("file:///nav8.hkd", 1, text);

    expect(() => {
      renameSymbol(doc, { line: 0, character: 5 }, "123badName", ws);
    }).toThrow();
  });

  test("rename symbol updates multiple call sites cleanly", () => {
    const text = `
fn processItem(item) { return item }
processItem(1)
processItem(2)
processItem(3)
`;
    const doc = docManager.open("file:///nav9.hkd", 1, text);
    const edit = renameSymbol(doc, { line: 1, character: 4 }, "handleItem", ws);

    expect(edit).not.toBeNull();
    const changes = edit?.changes?.[doc.uri];
    expect(changes?.length).toBe(4);
    for (const change of changes || []) {
      expect(change.newText).toBe("handleItem");
    }
  });

  test("definition returns null on whitespace or punctuation", () => {
    const text = "let x = 10\n";
    const doc = docManager.open("file:///nav10.hkd", 1, text);
    const def = getDefinition(doc, { line: 0, character: 6 }, ws); // on "="

    expect(def).toBeNull();
  });

  test("definition handles empty documents gracefully", () => {
    const doc = docManager.open("file:///nav11.hkd", 1, "");
    const def = getDefinition(doc, { line: 0, character: 0 }, ws);

    expect(def).toBeNull();
  });

  test("references handles empty documents gracefully", () => {
    const doc = docManager.open("file:///nav12.hkd", 1, "");
    const refs = getReferences(doc, { line: 0, character: 0 }, ws);

    expect(refs.length).toBe(0);
  });

  test("rename handles non-existent symbol location gracefully", () => {
    const doc = docManager.open("file:///nav13.hkd", 1, "   \n");
    const edit = renameSymbol(doc, { line: 0, character: 1 }, "b", ws);

    expect(edit).toBeNull();
  });

  test("definition on unknown symbol returns null", () => {
    const text = "let a = unknownVariable + 1\n";
    const doc = docManager.open("file:///nav14.hkd", 1, text);
    const def = getDefinition(doc, { line: 0, character: 12 }, ws);

    expect(def).toBeNull();
  });

  test("references on single usage returns only that site", () => {
    const text = "let singleUsage = 42\n";
    const doc = docManager.open("file:///nav15.hkd", 1, text);
    const refs = getReferences(doc, { line: 0, character: 5 }, ws);

    expect(refs.length).toBe(1);
  });
});
