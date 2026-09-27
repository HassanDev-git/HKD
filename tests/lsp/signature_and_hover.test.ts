import { DocumentManager } from "../../src/lsp/documents.js";
import { WorkspaceGraph } from "../../src/lsp/workspace-graph.js";
import { getHover, getSignatureHelp } from "../../src/lsp/features.js";

describe("HKD LSP 2.0 — Signature Help & Hover Intelligence", () => {
  const docManager = new DocumentManager();
  const ws = new WorkspaceGraph();

  test("hover on 'let' keyword displays documentation", () => {
    const doc = docManager.open("file:///sh1.hkd", 1, "let x = 1\n");
    const h = getHover(doc, { line: 0, character: 1 }, ws);
    expect(h).not.toBeNull();
    const val = typeof h?.contents === "object" ? h.contents.value : h?.contents;
    expect(val).toContain("mutable local or module variable");
  });

  test("hover on 'const' keyword displays documentation", () => {
    const doc = docManager.open("file:///sh2.hkd", 1, "const Y = 2\n");
    const h = getHover(doc, { line: 0, character: 2 }, ws);
    expect(h).not.toBeNull();
    const val = typeof h?.contents === "object" ? h.contents.value : h?.contents;
    expect(val).toContain("immutable constant");
  });

  test("hover on 'struct' keyword displays documentation", () => {
    const doc = docManager.open("file:///sh3.hkd", 1, "struct S {}\n");
    const h = getHover(doc, { line: 0, character: 2 }, ws);
    expect(h).not.toBeNull();
    const val = typeof h?.contents === "object" ? h.contents.value : h?.contents;
    expect(val).toContain("structured data record");
  });

  test("hover on 'assert' keyword displays documentation", () => {
    const doc = docManager.open("file:///sh4.hkd", 1, "assert(true)\n");
    const h = getHover(doc, { line: 0, character: 2 }, ws);
    expect(h).not.toBeNull();
    const val = typeof h?.contents === "object" ? h.contents.value : h?.contents;
    expect(val).toContain("Evaluates condition and aborts");
  });

  test("hover on 'while' keyword displays documentation", () => {
    const doc = docManager.open("file:///sh5.hkd", 1, "while true {}\n");
    const h = getHover(doc, { line: 0, character: 2 }, ws);
    expect(h).not.toBeNull();
    const val = typeof h?.contents === "object" ? h.contents.value : h?.contents;
    expect(val).toContain("Executes statement block while condition remains truthy");
  });

  test("hover on 'for' keyword displays documentation", () => {
    const doc = docManager.open("file:///sh6.hkd", 1, "for i in 0..10 {}\n");
    const h = getHover(doc, { line: 0, character: 1 }, ws);
    expect(h).not.toBeNull();
    const val = typeof h?.contents === "object" ? h.contents.value : h?.contents;
    expect(val).toContain("Iterates over elements");
  });

  test("hover on 'print' built-in displays documentation", () => {
    const doc = docManager.open("file:///sh7.hkd", 1, "print(10)\n");
    const h = getHover(doc, { line: 0, character: 2 }, ws);
    expect(h).not.toBeNull();
    const val = typeof h?.contents === "object" ? h.contents.value : h?.contents;
    expect(val).toContain("standard output without trailing newline");
  });

  test("hover on user-defined function shows signature with parameter types", () => {
    const text = `
fn greet(name: string, age: int) -> string {
    return "Hello"
}
greet("HKD", 1)
`;
    const doc = docManager.open("file:///sh8.hkd", 1, text);
    const h = getHover(doc, { line: 4, character: 2 }, ws);
    expect(h).not.toBeNull();
    const val = typeof h?.contents === "object" ? h.contents.value : h?.contents;
    expect(val).toContain("fn greet(name: string, age: int)");
  });

  test("hover on user struct displays fields outline", () => {
    const text = `
struct Account {
    balance: float
    verified: bool
}
`;
    const doc = docManager.open("file:///sh9.hkd", 1, text);
    const h = getHover(doc, { line: 1, character: 8 }, ws);
    expect(h).not.toBeNull();
    const val = typeof h?.contents === "object" ? h.contents.value : h?.contents;
    expect(val).toContain("struct Account");
    expect(val).toContain("balance: float");
    expect(val).toContain("verified: bool");
  });

  test("hover on whitespace returns null", () => {
    const doc = docManager.open("file:///sh10.hkd", 1, "   \n");
    const h = getHover(doc, { line: 0, character: 1 }, ws);
    expect(h).toBeNull();
  });

  test("signature help highlights first parameter when at opening parenthesis", () => {
    const text = `
fn connect(host: string, port: int, secure: bool) {
    return true
}
connect(
`;
    const doc = docManager.open("file:///sh11.hkd", 1, text);
    const sig = getSignatureHelp(doc, { line: 4, character: 8 });

    expect(sig).not.toBeNull();
    expect(sig?.activeParameter).toBe(0);
    expect(sig?.signatures[0].parameters?.[0].label).toContain("host");
  });

  test("signature help highlights second parameter after first comma", () => {
    const text = `
fn connect(host: string, port: int, secure: bool) {
    return true
}
connect("localhost", 
`;
    const doc = docManager.open("file:///sh12.hkd", 1, text);
    const sig = getSignatureHelp(doc, { line: 4, character: 21 });

    expect(sig).not.toBeNull();
    expect(sig?.activeParameter).toBe(1);
    expect(sig?.signatures[0].parameters?.[1].label).toContain("port");
  });

  test("signature help highlights third parameter after second comma", () => {
    const text = `
fn connect(host: string, port: int, secure: bool) {
    return true
}
connect("localhost", 8080, 
`;
    const doc = docManager.open("file:///sh13.hkd", 1, text);
    const sig = getSignatureHelp(doc, { line: 4, character: 27 });

    expect(sig).not.toBeNull();
    expect(sig?.activeParameter).toBe(2);
    expect(sig?.signatures[0].parameters?.[2].label).toContain("secure");
  });

  test("signature help returns null when not inside function call", () => {
    const text = "let a = 10\nlet b = 20\n";
    const doc = docManager.open("file:///sh14.hkd", 1, text);
    const sig = getSignatureHelp(doc, { line: 0, character: 5 });

    expect(sig).toBeNull();
  });

  test("signature help on unknown function call returns null", () => {
    const text = "nonExistentFunction(\n";
    const doc = docManager.open("file:///sh15.hkd", 1, text);
    const sig = getSignatureHelp(doc, { line: 0, character: 20 });

    expect(sig).toBeNull();
  });
});
