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

import * as readline from "readline";
import { HKD_VERSION, LanguageEdition } from "../utils/index.js";
import { ErrorReporter, formatDiagnostic } from "../errors/index.js";
import { Lexer } from "../lexer/lexer.js";
import { TokenKind } from "../lexer/token.js";
import { Parser } from "../parser/parser.js";
import { Compiler } from "../bytecode/compiler.js";
import { VM } from "../vm/vm.js";
import { formatValue } from "../bytecode/chunk.js";
import { registerStdlib } from "../stdlib/index.js";

// ─── REPL state ───────────────────────────────────────────────────────────────

const BOLD  = (s: string) => `\x1b[1m${s}\x1b[0m`;
const GREEN = (s: string) => `\x1b[32m${s}\x1b[0m`;
const CYAN  = (s: string) => `\x1b[36m${s}\x1b[0m`;
const RED   = (s: string) => `\x1b[31m${s}\x1b[0m`;
const DIM   = (s: string) => `\x1b[2m${s}\x1b[0m`;
const YELLOW = (s: string) => `\x1b[33m${s}\x1b[0m`;

export function startRepl(edition: LanguageEdition = "2026"): void {
  // Persistent VM for REPL state
  const vm = new VM((s) => process.stdout.write(s + "\n"));
  registerStdlib(vm);

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

  console.log(`\n${BOLD("HKD REPL")} v${HKD_VERSION} (Edition ${edition})`);
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
      if (ch === "{") inBlock++;
      if (ch === "}") inBlock = Math.max(0, inBlock - 1);
    }

    const trimmed = line.trim();
    const isIncomplete =
      inBlock > 0 ||
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

function evalAndPrint(source: string, vm: VM, edition: LanguageEdition = "2026"): void {
  const fileName = "<repl>";
  const reporter = new ErrorReporter(source, fileName);

  // Lex
  const lexer = new Lexer(source, fileName, reporter);
  const tokens = lexer.tokenize();

  if (reporter.hasErrors()) {
    printErrors(reporter, source, fileName);
    return;
  }

  // If it looks like an expression (not a statement), wrap it for value printing
  const wrappedSource = maybeWrapExpression(source, tokens);

  const reporter2 = new ErrorReporter(wrappedSource, fileName);
  const lexer2 = new Lexer(wrappedSource, fileName, reporter2);
  const tokens2 = lexer2.tokenize();
  const parser = new Parser(tokens2, wrappedSource, fileName, reporter2, edition);
  const ast = parser.parse();

  if (reporter2.hasErrors()) {
    printErrors(reporter2, wrappedSource, fileName);
    return;
  }

  // Compile
  const compiler = new Compiler(reporter2);
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
      : DIM(formatValue(result.value));

    console.log(`${DIM("=")} ${display}`);
  }
}

/**
 * If the input looks like a pure expression (no statement keywords),
 * wrap it so the VM returns the value.
 */
function maybeWrapExpression(source: string, tokens: ReturnType<Lexer["tokenize"]>): string {
  const stmtStarters = new Set([
    TokenKind.Let, TokenKind.Const, TokenKind.Fn, TokenKind.Struct,
    TokenKind.If, TokenKind.While, TokenKind.For, TokenKind.Return,
    TokenKind.Import, TokenKind.Export, TokenKind.Test, TokenKind.Type,
  ]);

  const firstMeaningful = tokens.find(
    (t) => t.kind !== TokenKind.Newline && t.kind !== TokenKind.Eof
  );

  if (!firstMeaningful || stmtStarters.has(firstMeaningful.kind)) {
    return source;
  }

  // Check if it's a multi-statement (has newlines between statements)
  const hasMultipleStatements = source.includes("\n") && tokens.some(
    (t, i) => t.kind === TokenKind.Newline && i > 0 && i < tokens.length - 2
  );
  if (hasMultipleStatements) return source;

  // Wrap in a print call so we see the value
  return source; // The VM's Halt instruction returns the last value
}

// ─── REPL commands ────────────────────────────────────────────────────────────

function handleCommand(cmd: string, rl: readline.Interface, _vm: VM): void {
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
      console.log(`HKD ${HKD_VERSION}`);
      break;
    default:
      console.log(RED(`Unknown REPL command: ${cmd}`));
      console.log(DIM("Type .help for available commands"));
  }

  rl.setPrompt(CYAN(">>> "));
  rl.prompt();
}

// ─── Error display ────────────────────────────────────────────────────────────

function printErrors(reporter: ErrorReporter, source: string, fileName: string): void {
  for (const diag of reporter.getErrors()) {
    process.stderr.write(RED(formatDiagnostic(diag, source, fileName)) + "\n\n");
  }
}
