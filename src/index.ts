/**
 * HKD — Public API
 *
 * This is the programmatic entry point for embedding HKD in other tools.
 * For the CLI, use src/cli/main.ts.
 */

export { runSource, runFile } from "./runtime/index.js";
export { Lexer, lex } from "./lexer/lexer.js";
export { Token, TokenKind } from "./lexer/token.js";
export { Parser, parse } from "./parser/parser.js";
export { SemanticAnalyser, analyse } from "./semantic/analyser.js";
export { Compiler, compile } from "./bytecode/compiler.js";
export { VM } from "./vm/vm.js";
export { format } from "./formatter/index.js";
export { lint } from "./linter/index.js";
export { registerStdlib } from "./stdlib/index.js";
export { HKD_VERSION } from "./utils/index.js";
export * from "./errors/index.js";
export * from "./ast/nodes.js";
