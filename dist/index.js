"use strict";
/**
 * HKD — Public API
 *
 * This is the programmatic entry point for embedding HKD in other tools.
 * For the CLI, use src/cli/main.ts.
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HKD_VERSION = exports.registerStdlib = exports.lint = exports.format = exports.VM = exports.compile = exports.Compiler = exports.analyse = exports.SemanticAnalyser = exports.parse = exports.Parser = exports.TokenKind = exports.lex = exports.Lexer = exports.runFile = exports.runSource = void 0;
var index_js_1 = require("./runtime/index.js");
Object.defineProperty(exports, "runSource", { enumerable: true, get: function () { return index_js_1.runSource; } });
Object.defineProperty(exports, "runFile", { enumerable: true, get: function () { return index_js_1.runFile; } });
var lexer_js_1 = require("./lexer/lexer.js");
Object.defineProperty(exports, "Lexer", { enumerable: true, get: function () { return lexer_js_1.Lexer; } });
Object.defineProperty(exports, "lex", { enumerable: true, get: function () { return lexer_js_1.lex; } });
var token_js_1 = require("./lexer/token.js");
Object.defineProperty(exports, "TokenKind", { enumerable: true, get: function () { return token_js_1.TokenKind; } });
var parser_js_1 = require("./parser/parser.js");
Object.defineProperty(exports, "Parser", { enumerable: true, get: function () { return parser_js_1.Parser; } });
Object.defineProperty(exports, "parse", { enumerable: true, get: function () { return parser_js_1.parse; } });
var analyser_js_1 = require("./semantic/analyser.js");
Object.defineProperty(exports, "SemanticAnalyser", { enumerable: true, get: function () { return analyser_js_1.SemanticAnalyser; } });
Object.defineProperty(exports, "analyse", { enumerable: true, get: function () { return analyser_js_1.analyse; } });
var compiler_js_1 = require("./bytecode/compiler.js");
Object.defineProperty(exports, "Compiler", { enumerable: true, get: function () { return compiler_js_1.Compiler; } });
Object.defineProperty(exports, "compile", { enumerable: true, get: function () { return compiler_js_1.compile; } });
var vm_js_1 = require("./vm/vm.js");
Object.defineProperty(exports, "VM", { enumerable: true, get: function () { return vm_js_1.VM; } });
var index_js_2 = require("./formatter/index.js");
Object.defineProperty(exports, "format", { enumerable: true, get: function () { return index_js_2.format; } });
var index_js_3 = require("./linter/index.js");
Object.defineProperty(exports, "lint", { enumerable: true, get: function () { return index_js_3.lint; } });
var index_js_4 = require("./stdlib/index.js");
Object.defineProperty(exports, "registerStdlib", { enumerable: true, get: function () { return index_js_4.registerStdlib; } });
var index_js_5 = require("./utils/index.js");
Object.defineProperty(exports, "HKD_VERSION", { enumerable: true, get: function () { return index_js_5.HKD_VERSION; } });
__exportStar(require("./errors/index.js"), exports);
__exportStar(require("./ast/nodes.js"), exports);
//# sourceMappingURL=index.js.map