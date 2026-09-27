import { DocumentManager, TrackedDocument } from "../../src/lsp/documents.js";

describe("HKD LSP 2.0 — Incremental Document Engine", () => {
  let docManager: DocumentManager;

  beforeEach(() => {
    docManager = new DocumentManager();
  });

  test("correctly converts positions and offsets in UTF-16 text", () => {
    const text = "fn add(a: int, b: int) -> int {\n    return a + b\n}\n";
    const doc = new TrackedDocument("file:///test.hkd", 1, text);

    // Line 0, char 0 -> offset 0
    expect(doc.positionToOffset({ line: 0, character: 0 })).toBe(0);
    expect(doc.offsetToPosition(0)).toEqual({ line: 0, character: 0 });

    // Line 1, char 4 -> "return"
    const offsetLine1 = text.indexOf("return");
    expect(doc.offsetToPosition(offsetLine1)).toEqual({ line: 1, character: 4 });
    expect(doc.positionToOffset({ line: 1, character: 4 })).toBe(offsetLine1);
  });

  test("handles full document replacements", () => {
    const doc = docManager.open("file:///script.hkd", 1, "let x = 10\n");
    expect(doc.text).toBe("let x = 10\n");

    docManager.update("file:///script.hkd", 2, [{ text: "let x = 20\nlet y = 30\n" }]);
    expect(doc.text).toBe("let x = 20\nlet y = 30\n");
  });

  test("handles incremental delta edits", () => {
    const doc = docManager.open("file:///delta.hkd", 1, "let value = 100\n");
    // Replace "100" with "999" (line 0, col 12 to 15)
    docManager.update("file:///delta.hkd", 2, [
      {
        range: {
          start: { line: 0, character: 12 },
          end: { line: 0, character: 15 },
        },
        text: "999",
      },
    ]);

    expect(doc.text).toBe("let value = 999\n");
  });

  test("computes real compiler diagnostics on syntax errors", () => {
    const doc = docManager.open("file:///syntax_err.hkd", 1, "fn invalid(\n");
    docManager.analyze(doc);

    expect(doc.diagnostics.length).toBeGreaterThan(0);
    expect(doc.diagnostics[0].severity).toBe(1); // Error
  });

  test("computes zero diagnostics for clean code", () => {
    const doc = docManager.open("file:///clean.hkd", 1, "fn add(a, b) {\n    return a + b\n}\n");
    docManager.analyze(doc);

    expect(doc.diagnostics.filter((d) => d.severity === 1).length).toBe(0);
  });
});
