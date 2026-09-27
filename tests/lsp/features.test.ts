import { DocumentManager } from "../../src/lsp/documents.js";
import { WorkspaceGraph } from "../../src/lsp/workspace-graph.js";
import {
  getCompletionItems,
  getSignatureHelp,
  getHover,
  getDefinition,
  getReferences,
  renameSymbol,
  getDocumentSymbols,
  getDocumentHighlights,
  getCodeActions,
  getCodeLenses,
} from "../../src/lsp/features.js";
import { computeSemanticTokens } from "../../src/lsp/semantic-tokens.js";

describe("HKD LSP 2.0 — Compiler-Backed Semantic Features", () => {
  const docManager = new DocumentManager();
  const ws = new WorkspaceGraph();

  test("completion provides keywords and declared functions/variables", () => {
    const text = `
fn calculateTotal(price, qty) {
    let tax = 0.05
    return price * qty * (1 + tax)
}
const MAX_LIMIT = 500
`;
    const doc = docManager.open("file:///calc.hkd", 1, text);
    const items = getCompletionItems(doc, { line: 6, character: 0 }, ws);

    const labels = items.map((i) => i.label);
    expect(labels).toContain("fn");
    expect(labels).toContain("let");
    expect(labels).toContain("calculateTotal");
    expect(labels).toContain("MAX_LIMIT");
  });

  test("completion provides members after dot for standard library modules", () => {
    const text = "math.";
    const doc = docManager.open("file:///math_test.hkd", 1, text);
    const items = getCompletionItems(doc, { line: 0, character: 5 }, ws);

    const labels = items.map((i) => i.label);
    expect(labels).toContain("abs");
    expect(labels).toContain("sqrt");
    expect(labels).toContain("floor");
    expect(labels).toContain("ceil");
  });

  test("signature help tracks active parameters", () => {
    const text = `
fn sendRequest(url, method, timeout) {
    return true
}
let res = sendRequest("https://hkd.lang", 
`;
    const doc = docManager.open("file:///sig.hkd", 1, text);
    const sig = getSignatureHelp(doc, { line: 4, character: 42 });

    expect(sig).not.toBeNull();
    expect(sig?.signatures.length).toBe(1);
    expect(sig?.activeParameter).toBe(1); // Second argument (method)
  });

  test("hover returns markdown documentation for keywords and symbols", () => {
    const text = `
fn computeHash(data) {
    return data
}
`;
    const doc = docManager.open("file:///hover.hkd", 1, text);

    // Hover on 'fn' keyword
    const kwHover = getHover(doc, { line: 1, character: 1 }, ws);
    expect(kwHover).not.toBeNull();
    expect(typeof kwHover?.contents === "object" ? kwHover.contents.value : kwHover?.contents).toContain("Declares a named function");

    // Hover on 'computeHash' function
    const fnHover = getHover(doc, { line: 1, character: 5 }, ws);
    expect(fnHover).not.toBeNull();
    expect(typeof fnHover?.contents === "object" ? fnHover.contents.value : fnHover?.contents).toContain("fn computeHash");
  });

  test("go to definition resolves exact source spans for local symbols", () => {
    const text = `
let userScore = 95
let finalResult = userScore + 5
`;
    const doc = docManager.open("file:///def.hkd", 1, text);
    const def = getDefinition(doc, { line: 2, character: 20 }, ws); // on 'userScore'

    expect(def).not.toBeNull();
    expect(Array.isArray(def)).toBe(false);
    const loc = def as { range: { start: { line: number; character: number } } };
    expect(loc.range.start.line).toBe(1); // Line 1 is let userScore
  });

  test("find references locates all semantic usages of an identifier", () => {
    const text = `
let counter = 0
counter = counter + 1
print(counter)
// counter in comment should be ignored
`;
    const doc = docManager.open("file:///refs.hkd", 1, text);
    const refs = getReferences(doc, { line: 1, character: 5 }, ws);

    // Should find the 4 occurrences in code, ignoring the line comment
    expect(refs.length).toBe(4);
  });

  test("safe rename updates all references with validation", () => {
    const text = `
let token = "abc"
print(token)
`;
    const doc = docManager.open("file:///rename.hkd", 1, text);
    const edit = renameSymbol(doc, { line: 1, character: 5 }, "authToken", ws);

    expect(edit).not.toBeNull();
    const changes = edit?.changes?.[doc.uri];
    expect(changes?.length).toBe(2);
    expect(changes?.[0].newText).toBe("authToken");
  });

  test("document symbols creates hierarchical outline", () => {
    const text = `
struct User {
    id: int
    name: string
}
fn login(user) {
    return true
}
const MAX_ATTEMPTS = 3
`;
    const doc = docManager.open("file:///symbols.hkd", 1, text);
    const symbols = getDocumentSymbols(doc);

    expect(symbols.length).toBe(3);
    const names = symbols.map((s) => s.name);
    expect(names).toContain("User");
    expect(names).toContain("login");
    expect(names).toContain("MAX_ATTEMPTS");
  });

  test("document highlight finds occurrences of symbol under cursor", () => {
    const text = `
let x = 10
let y = x + 5
`;
    const doc = docManager.open("file:///hl.hkd", 1, text);
    const hls = getDocumentHighlights(doc, { line: 1, character: 5 });

    expect(hls.length).toBe(2);
  });

  test("semantic tokens produces delta-encoded tokens", () => {
    const text = `fn add(a, b) {
    let result = a + b
    return result
}
`;
    const doc = docManager.open("file:///tokens.hkd", 1, text);
    const semTokens = computeSemanticTokens(doc);

    expect(semTokens.data.length).toBeGreaterThan(0);
    // Multiples of 5 per token [deltaLine, deltaStartChar, length, tokenType, tokenModifiers]
    expect(semTokens.data.length % 5).toBe(0);
  });

  test("code actions offers formatting", () => {
    const text = "let a=1+2\n";
    const doc = docManager.open("file:///action.hkd", 1, text);
    const actions = getCodeActions(doc, {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 5 },
    });

    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].title).toContain("Format document");
  });

  test("code lens discovers test statements for test runners", () => {
    const text = `
test "math addition works" {
    assert(1 + 1 == 2)
}
`;
    const doc = docManager.open("file:///lens.hkd", 1, text);
    const lenses = getCodeLenses(doc);

    expect(lenses.length).toBeGreaterThan(0);
    const titles = lenses.map((l) => l.command?.title);
    expect(titles).toContain("▶ Run Test");
    expect(titles).toContain("🐞 Debug Test");
  });
});
