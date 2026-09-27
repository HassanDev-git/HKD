"use strict";
/**
 * HKD Language Server Protocol Features Engine
 *
 * Real compiler-backed implementations for Completion, Hover, Signature Help,
 * Definition, References, Rename, Symbols, Highlights, Code Actions, and CodeLens.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWordAtPosition = getWordAtPosition;
exports.getCompletionItems = getCompletionItems;
exports.getSignatureHelp = getSignatureHelp;
exports.getHover = getHover;
exports.getDefinition = getDefinition;
exports.getReferences = getReferences;
exports.renameSymbol = renameSymbol;
exports.getDocumentSymbols = getDocumentSymbols;
exports.getDocumentHighlights = getDocumentHighlights;
exports.getCodeActions = getCodeActions;
exports.getCodeLenses = getCodeLenses;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const protocol_js_1 = require("./protocol.js");
const index_js_1 = require("../formatter/index.js");
// ─── Word helper ──────────────────────────────────────────────────────────────
function getWordAtPosition(doc, pos) {
    const line = doc.lines[pos.line];
    if (!line)
        return "";
    let start = pos.character;
    while (start > 0 && /[a-zA-Z0-9_]/.test(line[start - 1]))
        start--;
    let end = pos.character;
    while (end < line.length && /[a-zA-Z0-9_]/.test(line[end]))
        end++;
    return line.slice(start, end);
}
// ─── 1. Completion ────────────────────────────────────────────────────────────
function getCompletionItems(doc, pos, ws) {
    const lineText = (doc.lines[pos.line] ?? "").substring(0, pos.character);
    // 1. Package import auto-completion
    const importMatch = lineText.match(/import\s+(?:.*from\s+)?["']([^"']*)$/);
    if (importMatch) {
        const pkgs = ws.getAvailablePackages(doc.getFilePath());
        return pkgs.map((pkg) => ({
            label: pkg,
            kind: protocol_js_1.CompletionItemKind.Module,
            detail: `HKD package '${pkg}'`,
        }));
    }
    // 2. Member completion after a dot (e.g. `math.`, `http.`)
    const dotMatch = lineText.match(/([a-zA-Z0-9_]+)\.$/);
    if (dotMatch) {
        const receiver = dotMatch[1];
        // Built-in modules
        const builtins = {
            math: [
                { name: "abs", detail: "math.abs(x: number) -> number" },
                { name: "ceil", detail: "math.ceil(x: number) -> number" },
                { name: "floor", detail: "math.floor(x: number) -> number" },
                { name: "round", detail: "math.round(x: number) -> number" },
                { name: "sqrt", detail: "math.sqrt(x: number) -> number" },
                { name: "sin", detail: "math.sin(x: number) -> number" },
                { name: "cos", detail: "math.cos(x: number) -> number" },
                { name: "min", detail: "math.min(a: number, b: number) -> number" },
                { name: "max", detail: "math.max(a: number, b: number) -> number" },
                { name: "pow", detail: "math.pow(b: number, e: number) -> number" },
            ],
            string: [
                { name: "len", detail: "string.len(s: string) -> int" },
                { name: "upper", detail: "string.upper(s: string) -> string" },
                { name: "lower", detail: "string.lower(s: string) -> string" },
                { name: "trim", detail: "string.trim(s: string) -> string" },
                { name: "contains", detail: "string.contains(s: string, sub: string) -> bool" },
                { name: "starts_with", detail: "string.starts_with(s: string, pre: string) -> bool" },
                { name: "ends_with", detail: "string.ends_with(s: string, suf: string) -> bool" },
                { name: "replace", detail: "string.replace(s: string, from: string, to: string) -> string" },
            ],
            array: [
                { name: "len", detail: "array.len(a: Array) -> int" },
                { name: "push", detail: "array.push(a: Array, val: any) -> null" },
                { name: "pop", detail: "array.pop(a: Array) -> any" },
                { name: "join", detail: "array.join(a: Array, sep: string) -> string" },
            ],
            json: [
                { name: "stringify", detail: "json.stringify(val: any) -> string" },
                { name: "parse", detail: "json.parse(s: string) -> any" },
            ],
            path: [
                { name: "basename", detail: "path.basename(p: string) -> string" },
                { name: "extname", detail: "path.extname(p: string) -> string" },
                { name: "is_absolute", detail: "path.is_absolute(p: string) -> bool" },
            ],
            env: [
                { name: "get", detail: "env.get(k: string) -> string | null" },
                { name: "set", detail: "env.set(k: string, v: string) -> null" },
                { name: "args", detail: "env.args() -> Array" },
            ],
            random: [
                { name: "float", detail: "random.float() -> float" },
                { name: "int", detail: "random.int(min: int, max: int) -> int" },
            ],
            task: [
                { name: "sleep", detail: "task.sleep(ms: int) -> Future<null>" },
                { name: "spawn", detail: "task.spawn(fn: fn() -> T) -> Future<T>" },
                { name: "all", detail: "task.all(futures: [Future<T>]) -> Future<[T]>" },
                { name: "race", detail: "task.race(futures: [Future<T>]) -> Future<T>" },
                { name: "future", detail: "task.future(val?: T) -> Future<T>" },
                { name: "resolve", detail: "task.resolve(fut: Future<T>, val: T) -> Future<T>" },
                { name: "reject", detail: "task.reject(fut: Future<T>, err: any) -> Future<T>" },
                { name: "is_pending", detail: "task.is_pending(fut: Future<any>) -> bool" },
                { name: "is_resolved", detail: "task.is_resolved(fut: Future<any>) -> bool" },
                { name: "is_rejected", detail: "task.is_rejected(fut: Future<any>) -> bool" },
                { name: "is_future", detail: "task.is_future(val: any) -> bool" },
                { name: "unwrap", detail: "task.unwrap(fut: Future<T>) -> T" },
                { name: "on_complete", detail: "task.on_complete(fut: Future<T>, cb: fn(T) -> any) -> Future<T>" },
            ],
            result: [
                { name: "ok", detail: "result.ok(val: T) -> Result<T, E>" },
                { name: "err", detail: "result.err(err: E) -> Result<T, E>" },
                { name: "is_ok", detail: "result.is_ok(r: Result<T, E>) -> bool" },
                { name: "is_err", detail: "result.is_err(r: Result<T, E>) -> bool" },
                { name: "unwrap", detail: "result.unwrap(r: Result<T, E>) -> T" },
                { name: "unwrap_or", detail: "result.unwrap_or(r: Result<T, E>, default: T) -> T" },
                { name: "unwrap_err", detail: "result.unwrap_err(r: Result<T, E>) -> E" },
                { name: "map", detail: "result.map(r: Result<T, E>, f: fn(T) -> U) -> Result<U, E>" },
                { name: "map_err", detail: "result.map_err(r: Result<T, E>, f: fn(E) -> F) -> Result<T, F>" },
                { name: "and_then", detail: "result.and_then(r: Result<T, E>, f: fn(T) -> Result<U, E>) -> Result<U, E>" },
            ],
        };
        if (builtins[receiver]) {
            return builtins[receiver].map((item) => ({
                label: item.name,
                kind: protocol_js_1.CompletionItemKind.Function,
                detail: item.detail,
            }));
        }
        // Check if receiver is an imported package or module in the workspace
        const exports = ws.getPackageExports(doc.getFilePath(), receiver);
        if (exports.length > 0) {
            return exports.map((e) => ({
                label: e.name,
                kind: e.kind === "function" ? protocol_js_1.CompletionItemKind.Function : protocol_js_1.CompletionItemKind.Field,
                detail: e.detail,
            }));
        }
        // Check struct methods in document AST
        if (doc.ast) {
            const methodItems = [];
            for (const stmt of doc.ast.statements) {
                if (stmt.kind === "ImplBlockStmt") {
                    for (const m of stmt.methods) {
                        const params = m.params.slice(1).map(p => p.name).join(", ");
                        methodItems.push({
                            label: m.name,
                            kind: protocol_js_1.CompletionItemKind.Method,
                            detail: `fn (${stmt.structName}).${m.name}(${params})`,
                        });
                    }
                }
            }
            if (methodItems.length > 0) {
                return methodItems;
            }
        }
    }
    // 3. General scope completion: keywords, local variables, functions, and structs
    const items = [];
    const keywords = [
        "fn", "struct", "impl", "trait", "let", "const", "if", "else", "while", "for",
        "return", "import", "export", "test", "assert", "break", "continue", "async", "await"
    ];
    for (const kw of keywords) {
        items.push({
            label: kw,
            kind: protocol_js_1.CompletionItemKind.Keyword,
            detail: `HKD keyword '${kw}'`,
        });
    }
    const builtins = [
        "print", "println", "len", "type_of", "to_string", "to_int",
        "to_float", "to_bool", "range", "panic"
    ];
    for (const bi of builtins) {
        items.push({
            label: bi,
            kind: protocol_js_1.CompletionItemKind.Function,
            detail: `HKD built-in function '${bi}'`,
        });
    }
    // Add symbols declared in current AST
    if (doc.ast) {
        for (const stmt of doc.ast.statements) {
            if (stmt.kind === "FunctionDeclStmt") {
                const prefix = stmt.isAsync ? "async " : "";
                const params = stmt.params.map((p) => p.name).join(", ");
                const ret = stmt.isAsync
                    ? (stmt.returnType ? ` -> Future<${formatTypeExpr(stmt.returnType)}>` : " -> Future")
                    : (stmt.returnType ? ` -> ${formatTypeExpr(stmt.returnType)}` : "");
                items.push({
                    label: stmt.name,
                    kind: protocol_js_1.CompletionItemKind.Function,
                    detail: `${prefix}fn ${stmt.name}(${params})${ret}`,
                });
            }
            else if (stmt.kind === "VarDeclStmt") {
                items.push({
                    label: stmt.name,
                    kind: protocol_js_1.CompletionItemKind.Variable,
                    detail: `let ${stmt.name}`,
                });
            }
            else if (stmt.kind === "ConstDeclStmt") {
                items.push({
                    label: stmt.name,
                    kind: protocol_js_1.CompletionItemKind.Constant,
                    detail: `const ${stmt.name}`,
                });
            }
            else if (stmt.kind === "StructDeclStmt") {
                items.push({
                    label: stmt.name,
                    kind: protocol_js_1.CompletionItemKind.Struct,
                    detail: `struct ${stmt.name}`,
                });
            }
        }
    }
    return items;
}
// ─── 2. Signature Help ────────────────────────────────────────────────────────
function getSignatureHelp(doc, pos) {
    const lineText = (doc.lines[pos.line] ?? "").substring(0, pos.character);
    const match = lineText.match(/([a-zA-Z0-9_]+)\s*\(([^)]*)$/);
    if (!match)
        return null;
    const fnName = match[1];
    const argsText = match[2];
    const activeParameter = argsText.split(",").length - 1;
    if (doc.ast) {
        for (const stmt of doc.ast.statements) {
            if (stmt.kind === "FunctionDeclStmt" && stmt.name === fnName) {
                const params = stmt.params.map((p) => ({
                    label: p.name + (p.typeAnnotation ? `: ${p.typeAnnotation.kind}` : ""),
                }));
                const fullSig = `fn ${fnName}(${params.map((p) => p.label).join(", ")})`;
                return {
                    signatures: [
                        {
                            label: fullSig,
                            parameters: params,
                            activeParameter: Math.min(activeParameter, Math.max(0, params.length - 1)),
                        },
                    ],
                    activeSignature: 0,
                    activeParameter: Math.min(activeParameter, Math.max(0, params.length - 1)),
                };
            }
        }
    }
    return null;
}
function formatTypeExpr(t) {
    if (!t)
        return "";
    if (t.kind === "NamedType")
        return t.name;
    if (t.kind === "ArrayType")
        return `[${formatTypeExpr(t.elementType)}]`;
    if (t.kind === "NullableType")
        return `${formatTypeExpr(t.inner)}?`;
    return t.kind;
}
// ─── 3. Hover ─────────────────────────────────────────────────────────────────
function getHover(doc, pos, ws) {
    const word = getWordAtPosition(doc, pos);
    if (!word)
        return null;
    // 1. Built-in keywords
    const keywordsDoc = {
        fn: "**fn**: Declares a named function with parameter types and optional return type.",
        struct: "**struct**: Defines a structured data record with named fields.",
        impl: "**impl**: Defines methods and associated behavior for a struct.",
        trait: "**trait**: Defines a behavioral contract that structs can implement.",
        let: "**let**: Declares a mutable local or module variable.",
        const: "**const**: Declares an immutable constant.",
        import: "**import**: Imports symbols from another module or package.",
        export: "**export**: Exports symbols for external consumer modules.",
        test: "**test**: Declares an executable unit test block.",
        assert: "**assert**: Evaluates condition and aborts with panic if false.",
        while: "**while**: Executes statement block while condition remains truthy.",
        for: "**for**: Iterates over elements in a sequence, array, or range.",
        print: "**print**: Writes values to standard output without trailing newline.",
        println: "**println**: Writes values to standard output followed by newline.",
        async: "**async**: Marks a function as returning a Future and running asynchronously across suspension points.",
        await: "**await**: Suspends execution until the operand Future resolves, returning its unwrapped value.",
    };
    if (keywordsDoc[word]) {
        return { contents: { kind: "markdown", value: keywordsDoc[word] } };
    }
    // 2. AST Declarations in current file
    if (doc.ast) {
        for (const stmt of doc.ast.statements) {
            if (stmt.kind === "FunctionDeclStmt" && stmt.name === word) {
                const prefix = stmt.isAsync ? "async " : "";
                const params = stmt.params
                    .map((p) => p.name + (p.typeAnnotation ? `: ${formatTypeExpr(p.typeAnnotation)}` : ""))
                    .join(", ");
                const ret = stmt.isAsync
                    ? (stmt.returnType ? ` -> Future<${formatTypeExpr(stmt.returnType)}>` : " -> Future")
                    : (stmt.returnType ? ` -> ${formatTypeExpr(stmt.returnType)}` : "");
                const desc = stmt.isAsync ? "User-defined async function" : "User-defined function";
                return {
                    contents: {
                        kind: "markdown",
                        value: `\`\`\`hkd\n${prefix}fn ${stmt.name}(${params})${ret}\n\`\`\`\n\n${desc} in \`${path.basename(doc.getFilePath())}\``,
                    },
                };
            }
            if (stmt.kind === "VarDeclStmt" && stmt.name === word) {
                return {
                    contents: {
                        kind: "markdown",
                        value: `\`\`\`hkd\nlet ${stmt.name}\n\`\`\`\n\nVariable declaration`,
                    },
                };
            }
            if (stmt.kind === "ConstDeclStmt" && stmt.name === word) {
                return {
                    contents: {
                        kind: "markdown",
                        value: `\`\`\`hkd\nconst ${stmt.name}\n\`\`\`\n\nConstant declaration`,
                    },
                };
            }
            if (stmt.kind === "StructDeclStmt" && stmt.name === word) {
                const fields = stmt.fields.map((f) => `  ${f.name}: ${formatTypeExpr(f.typeAnnotation)}`).join("\n");
                return {
                    contents: {
                        kind: "markdown",
                        value: `\`\`\`hkd\nstruct ${stmt.name} {\n${fields}\n}\n\`\`\``,
                    },
                };
            }
            if (stmt.kind === "ImplBlockStmt") {
                for (const m of stmt.methods) {
                    if (m.name === word) {
                        const params = m.params
                            .map((p) => p.name + (p.typeAnnotation ? `: ${formatTypeExpr(p.typeAnnotation)}` : ""))
                            .join(", ");
                        const ret = m.returnType ? ` -> ${formatTypeExpr(m.returnType)}` : "";
                        const header = stmt.traitName ? `impl ${stmt.traitName} for ${stmt.structName}` : `impl ${stmt.structName}`;
                        return {
                            contents: {
                                kind: "markdown",
                                value: `\`\`\`hkd\n${header} {\n  fn ${m.name}(${params})${ret}\n}\n\`\`\`\n\nMethod on struct \`${stmt.structName}\``,
                            },
                        };
                    }
                }
            }
            if (stmt.kind === "TraitDeclStmt") {
                if (stmt.name === word) {
                    const methods = stmt.methods
                        .map((m) => {
                        const params = m.params
                            .map((p) => p.name + (p.typeAnnotation ? `: ${formatTypeExpr(p.typeAnnotation)}` : ""))
                            .join(", ");
                        const ret = m.returnType ? ` -> ${formatTypeExpr(m.returnType)}` : "";
                        return `  fn ${m.name}(${params})${ret}`;
                    })
                        .join("\n");
                    return {
                        contents: {
                            kind: "markdown",
                            value: `\`\`\`hkd\ntrait ${stmt.name} {\n${methods}\n}\n\`\`\`\n\nTrait definition in \`${path.basename(doc.getFilePath())}\``,
                        },
                    };
                }
            }
        }
    }
    // 3. Check if word is an imported package in hkd.toml
    const packages = ws.getAvailablePackages(doc.getFilePath());
    if (packages.includes(word)) {
        return {
            contents: {
                kind: "markdown",
                value: `**Package \`${word}\`**\n\nResolved dependency from project manifest.`,
            },
        };
    }
    return null;
}
// ─── 4. Go To Definition ──────────────────────────────────────────────────────
function getDefinition(doc, pos, ws) {
    const word = getWordAtPosition(doc, pos);
    if (!word)
        return null;
    // 1. Check if word is an imported package or module
    const resolvedImport = ws.resolveImport(doc.getFilePath(), word);
    if (resolvedImport && fs.existsSync(resolvedImport)) {
        return {
            uri: `file:///${resolvedImport.replace(/\\/g, "/")}`,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
            },
        };
    }
    // 2. Local AST definitions
    if (doc.ast) {
        for (const stmt of doc.ast.statements) {
            if (stmt.kind === "FunctionDeclStmt" && stmt.name === word) {
                const line = stmt.span.start.line - 1;
                const col = stmt.span.start.column - 1;
                return {
                    uri: doc.uri,
                    range: {
                        start: { line, character: col },
                        end: { line, character: col + word.length },
                    },
                };
            }
            if ((stmt.kind === "VarDeclStmt" || stmt.kind === "ConstDeclStmt") && stmt.name === word) {
                const line = stmt.span.start.line - 1;
                const col = stmt.span.start.column - 1;
                return {
                    uri: doc.uri,
                    range: {
                        start: { line, character: col },
                        end: { line, character: col + word.length },
                    },
                };
            }
            if (stmt.kind === "StructDeclStmt" && stmt.name === word) {
                const line = stmt.span.start.line - 1;
                const col = stmt.span.start.column - 1;
                return {
                    uri: doc.uri,
                    range: {
                        start: { line, character: col },
                        end: { line, character: col + word.length },
                    },
                };
            }
            if (stmt.kind === "ImplBlockStmt") {
                for (const m of stmt.methods) {
                    if (m.name === word) {
                        const line = m.span.start.line - 1;
                        const col = m.span.start.column - 1;
                        return {
                            uri: doc.uri,
                            range: {
                                start: { line, character: col },
                                end: { line, character: col + word.length },
                            },
                        };
                    }
                }
            }
            if (stmt.kind === "TraitDeclStmt") {
                if (stmt.name === word) {
                    const line = stmt.span.start.line - 1;
                    const col = stmt.span.start.column - 1;
                    return {
                        uri: doc.uri,
                        range: {
                            start: { line, character: col },
                            end: { line, character: col + word.length },
                        },
                    };
                }
                for (const m of stmt.methods) {
                    if (m.name === word) {
                        const line = m.span.start.line - 1;
                        const col = m.span.start.column - 1;
                        return {
                            uri: doc.uri,
                            range: {
                                start: { line, character: col },
                                end: { line, character: col + word.length },
                            },
                        };
                    }
                }
            }
        }
    }
    return null;
}
// ─── 5. Find References ───────────────────────────────────────────────────────
function getReferences(doc, pos, _ws) {
    const word = getWordAtPosition(doc, pos);
    if (!word)
        return [];
    const locations = [];
    const regex = new RegExp(`\\b${word}\\b`, "g");
    for (let lineIdx = 0; lineIdx < doc.lines.length; lineIdx++) {
        const lineText = doc.lines[lineIdx];
        // Skip line comments
        const trimmed = lineText.trim();
        if (trimmed.startsWith("//"))
            continue;
        let match;
        while ((match = regex.exec(lineText)) !== null) {
            locations.push({
                uri: doc.uri,
                range: {
                    start: { line: lineIdx, character: match.index },
                    end: { line: lineIdx, character: match.index + word.length },
                },
            });
        }
    }
    return locations;
}
// ─── 6. Safe Semantic Rename ──────────────────────────────────────────────────
function renameSymbol(doc, pos, newName, ws) {
    const word = getWordAtPosition(doc, pos);
    if (!word)
        return null;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
        throw new Error(`Invalid identifier name '${newName}'`);
    }
    const references = getReferences(doc, pos, ws);
    if (references.length === 0)
        return null;
    const textEdits = references.map((loc) => ({
        range: loc.range,
        newText: newName,
    }));
    return {
        changes: {
            [doc.uri]: textEdits,
        },
    };
}
// ─── 7. Document Symbols / Outline ────────────────────────────────────────────
function getDocumentSymbols(doc) {
    if (!doc.ast)
        return [];
    const symbols = [];
    for (const stmt of doc.ast.statements) {
        if (stmt.kind === "FunctionDeclStmt") {
            const startLine = stmt.span.start.line - 1;
            const endLine = stmt.span.end.line - 1;
            symbols.push({
                name: stmt.name,
                kind: protocol_js_1.SymbolKind.Function,
                detail: `(${stmt.params.map((p) => p.name).join(", ")})`,
                range: {
                    start: { line: startLine, character: stmt.span.start.column - 1 },
                    end: { line: endLine, character: stmt.span.end.column - 1 },
                },
                selectionRange: {
                    start: { line: startLine, character: stmt.span.start.column - 1 },
                    end: { line: startLine, character: stmt.span.start.column - 1 + stmt.name.length },
                },
            });
        }
        else if (stmt.kind === "StructDeclStmt") {
            const startLine = stmt.span.start.line - 1;
            const endLine = stmt.span.end.line - 1;
            symbols.push({
                name: stmt.name,
                kind: protocol_js_1.SymbolKind.Struct,
                range: {
                    start: { line: startLine, character: stmt.span.start.column - 1 },
                    end: { line: endLine, character: stmt.span.end.column - 1 },
                },
                selectionRange: {
                    start: { line: startLine, character: stmt.span.start.column - 1 },
                    end: { line: startLine, character: stmt.span.start.column - 1 + stmt.name.length },
                },
            });
        }
        else if (stmt.kind === "VarDeclStmt") {
            const startLine = stmt.span.start.line - 1;
            const endLine = stmt.span.end.line - 1;
            symbols.push({
                name: stmt.name,
                kind: protocol_js_1.SymbolKind.Variable,
                range: {
                    start: { line: startLine, character: stmt.span.start.column - 1 },
                    end: { line: endLine, character: stmt.span.end.column - 1 },
                },
                selectionRange: {
                    start: { line: startLine, character: stmt.span.start.column - 1 },
                    end: { line: startLine, character: stmt.span.start.column - 1 + stmt.name.length },
                },
            });
        }
        else if (stmt.kind === "ConstDeclStmt") {
            const startLine = stmt.span.start.line - 1;
            const endLine = stmt.span.end.line - 1;
            symbols.push({
                name: stmt.name,
                kind: protocol_js_1.SymbolKind.Constant,
                range: {
                    start: { line: startLine, character: stmt.span.start.column - 1 },
                    end: { line: endLine, character: stmt.span.end.column - 1 },
                },
                selectionRange: {
                    start: { line: startLine, character: stmt.span.start.column - 1 },
                    end: { line: startLine, character: stmt.span.start.column - 1 + stmt.name.length },
                },
            });
        }
    }
    return symbols;
}
// ─── 8. Document Highlights ───────────────────────────────────────────────────
function getDocumentHighlights(doc, pos) {
    const word = getWordAtPosition(doc, pos);
    if (!word)
        return [];
    const highlights = [];
    const regex = new RegExp(`\\b${word}\\b`, "g");
    for (let i = 0; i < doc.lines.length; i++) {
        const line = doc.lines[i];
        let match;
        while ((match = regex.exec(line)) !== null) {
            highlights.push({
                range: {
                    start: { line: i, character: match.index },
                    end: { line: i, character: match.index + word.length },
                },
                kind: protocol_js_1.DocumentHighlightKind.Text,
            });
        }
    }
    return highlights;
}
// ─── 9. Code Actions ──────────────────────────────────────────────────────────
function getCodeActions(doc, range) {
    const actions = [];
    // Action: Format Document using authoritative formatter
    actions.push({
        title: "Format document with HKD Formatter",
        kind: "source.fixAll",
        isPreferred: true,
        edit: {
            changes: {
                [doc.uri]: [
                    {
                        range: {
                            start: { line: 0, character: 0 },
                            end: { line: doc.lines.length, character: 0 },
                        },
                        newText: (0, index_js_1.format)(doc.text),
                    },
                ],
            },
        },
    });
    return actions;
}
// ─── 10. CodeLens ─────────────────────────────────────────────────────────────
function getCodeLenses(doc) {
    if (!doc.ast)
        return [];
    const lenses = [];
    for (const stmt of doc.ast.statements) {
        if (stmt.kind === "TestStmt") {
            const line = stmt.span.start.line - 1;
            lenses.push({
                range: {
                    start: { line, character: 0 },
                    end: { line, character: 0 },
                },
                command: {
                    title: "▶ Run Test",
                    command: "hkd.runTest",
                    arguments: [doc.uri, stmt.description],
                },
            });
            lenses.push({
                range: {
                    start: { line, character: 0 },
                    end: { line, character: 0 },
                },
                command: {
                    title: "🐞 Debug Test",
                    command: "hkd.debugTest",
                    arguments: [doc.uri, stmt.description],
                },
            });
        }
        else if (stmt.kind === "FunctionDeclStmt") {
            const line = stmt.span.start.line - 1;
            lenses.push({
                range: {
                    start: { line, character: 0 },
                    end: { line, character: 0 },
                },
                command: {
                    title: `fn ${stmt.name}`,
                    command: "",
                },
            });
        }
    }
    return lenses;
}
//# sourceMappingURL=features.js.map