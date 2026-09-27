"use strict";
/**
 * HKD REPL (Read-Eval-Print Loop)
 *
 * Supports:
 *   - Multi-line input detection
 *   - Persistent state across evaluations
 *   - Command history (via readline)
 *   - .help, .exit, .clear, .version commands
 *   - Pretty error display
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
exports.startRepl = startRepl;
const readline = __importStar(require("readline"));
const index_js_1 = require("../utils/index.js");
const index_js_2 = require("../errors/index.js");
const lexer_js_1 = require("../lexer/lexer.js");
const token_js_1 = require("../lexer/token.js");
const parser_js_1 = require("../parser/parser.js");
const compiler_js_1 = require("../bytecode/compiler.js");
const vm_js_1 = require("../vm/vm.js");
const chunk_js_1 = require("../bytecode/chunk.js");
const index_js_3 = require("../stdlib/index.js");
// ─── REPL state ───────────────────────────────────────────────────────────────
const BOLD = (s) => `\x1b[1m${s}\x1b[0m`;
const GREEN = (s) => `\x1b[32m${s}\x1b[0m`;
const CYAN = (s) => `\x1b[36m${s}\x1b[0m`;
const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
function startRepl(edition = "2026") {
    // Persistent VM for REPL state
    const vm = new vm_js_1.VM((s) => process.stdout.write(s + "\n"));
    (0, index_js_3.registerStdlib)(vm);
    // Override input() to use readline
    vm.defineNative("input", 1, (_args) => {
        // Synchronous input in REPL context isn't straightforward with readline
        // Return empty for now — async input needs a different approach
        return "";
    });
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: CYAN(">>> "),
        terminal: true,
    });
    console.log(`\n${BOLD("HKD REPL")} v${index_js_1.HKD_VERSION} (Edition ${edition})`);
    console.log(DIM("Type .help for available commands, .exit to quit"));
    console.log("");
    rl.prompt();
    let buffer = "";
    let inBlock = 0; // Track open braces for multi-line input
    rl.on("line", (line) => {
        // REPL commands
        if (buffer === "" && line.trim().startsWith(".")) {
            handleCommand(line.trim(), rl, vm);
            return;
        }
        buffer += (buffer ? "\n" : "") + line;
        // Count brace depth for multi-line detection
        for (const ch of line) {
            if (ch === "{")
                inBlock++;
            if (ch === "}")
                inBlock = Math.max(0, inBlock - 1);
        }
        const trimmed = line.trim();
        const isIncomplete = inBlock > 0 ||
            trimmed.endsWith("{") ||
            trimmed.endsWith("(") ||
            trimmed.endsWith(",");
        if (isIncomplete) {
            rl.setPrompt(CYAN("... "));
            rl.prompt();
            return;
        }
        if (buffer.trim() === "") {
            rl.setPrompt(CYAN(">>> "));
            rl.prompt();
            buffer = "";
            inBlock = 0;
            return;
        }
        // Execute the buffered input
        evalAndPrint(buffer, vm, edition);
        buffer = "";
        inBlock = 0;
        rl.setPrompt(CYAN(">>> "));
        rl.prompt();
    });
    rl.on("close", () => {
        console.log("\n" + DIM("Goodbye!"));
        process.exit(0);
    });
}
// ─── Evaluate and print ───────────────────────────────────────────────────────
function evalAndPrint(source, vm, edition = "2026") {
    const fileName = "<repl>";
    const reporter = new index_js_2.ErrorReporter(source, fileName);
    // Lex
    const lexer = new lexer_js_1.Lexer(source, fileName, reporter);
    const tokens = lexer.tokenize();
    if (reporter.hasErrors()) {
        printErrors(reporter, source, fileName);
        return;
    }
    // If it looks like an expression (not a statement), wrap it for value printing
    const wrappedSource = maybeWrapExpression(source, tokens);
    const reporter2 = new index_js_2.ErrorReporter(wrappedSource, fileName);
    const lexer2 = new lexer_js_1.Lexer(wrappedSource, fileName, reporter2);
    const tokens2 = lexer2.tokenize();
    const parser = new parser_js_1.Parser(tokens2, wrappedSource, fileName, reporter2, edition);
    const ast = parser.parse();
    if (reporter2.hasErrors()) {
        printErrors(reporter2, wrappedSource, fileName);
        return;
    }
    // Compile
    const compiler = new compiler_js_1.Compiler(reporter2);
    const chunk = compiler.compile(ast);
    if (reporter2.hasErrors()) {
        printErrors(reporter2, wrappedSource, fileName);
        return;
    }
    // Run in persistent VM
    const result = vm.run(chunk);
    if (!result.ok) {
        process.stderr.write(RED(`\nRuntime Error: ${result.error}\n`));
        return;
    }
    // Print result if non-null
    if (result.value !== null && result.value !== undefined) {
        const display = typeof result.value === "string"
            ? YELLOW(`"${result.value}"`)
            : typeof result.value === "number"
                ? CYAN(String(result.value))
                : typeof result.value === "boolean"
                    ? CYAN(String(result.value))
                    : DIM((0, chunk_js_1.formatValue)(result.value));
        console.log(`${DIM("=")} ${display}`);
    }
}
/**
 * If the input looks like a pure expression (no statement keywords),
 * wrap it so the VM returns the value.
 */
function maybeWrapExpression(source, tokens) {
    const stmtStarters = new Set([
        token_js_1.TokenKind.Let, token_js_1.TokenKind.Const, token_js_1.TokenKind.Fn, token_js_1.TokenKind.Struct,
        token_js_1.TokenKind.If, token_js_1.TokenKind.While, token_js_1.TokenKind.For, token_js_1.TokenKind.Return,
        token_js_1.TokenKind.Import, token_js_1.TokenKind.Export, token_js_1.TokenKind.Test, token_js_1.TokenKind.Type,
    ]);
    const firstMeaningful = tokens.find((t) => t.kind !== token_js_1.TokenKind.Newline && t.kind !== token_js_1.TokenKind.Eof);
    if (!firstMeaningful || stmtStarters.has(firstMeaningful.kind)) {
        return source;
    }
    // Check if it's a multi-statement (has newlines between statements)
    const hasMultipleStatements = source.includes("\n") && tokens.some((t, i) => t.kind === token_js_1.TokenKind.Newline && i > 0 && i < tokens.length - 2);
    if (hasMultipleStatements)
        return source;
    // Wrap in a print call so we see the value
    return source; // The VM's Halt instruction returns the last value
}
// ─── REPL commands ────────────────────────────────────────────────────────────
function handleCommand(cmd, rl, _vm) {
    switch (cmd) {
        case ".help":
            console.log(`
${BOLD("REPL Commands:")}
  ${CYAN(".help")}     Show this help
  ${CYAN(".clear")}    Clear the screen
  ${CYAN(".exit")}     Exit the REPL
  ${CYAN(".version")}  Show HKD version
`);
            break;
        case ".clear":
            process.stdout.write("\x1b[2J\x1b[H");
            break;
        case ".exit":
        case ".quit":
            rl.close();
            return;
        case ".version":
            console.log(`HKD ${index_js_1.HKD_VERSION}`);
            break;
        default:
            console.log(RED(`Unknown REPL command: ${cmd}`));
            console.log(DIM("Type .help for available commands"));
    }
    rl.setPrompt(CYAN(">>> "));
    rl.prompt();
}
// ─── Error display ────────────────────────────────────────────────────────────
function printErrors(reporter, source, fileName) {
    for (const diag of reporter.getErrors()) {
        process.stderr.write(RED((0, index_js_2.formatDiagnostic)(diag, source, fileName)) + "\n\n");
    }
}
//# sourceMappingURL=repl.js.map