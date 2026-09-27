"use strict";
/**
 * HKD Runtime
 *
 * The high-level pipeline: source → lex → parse → analyse → compile → run.
 * This is the single entry point for executing HKD programs.
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
exports.runSource = runSource;
exports.runFile = runFile;
exports.loadModule = loadModule;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const index_js_1 = require("../errors/index.js");
const lexer_js_1 = require("../lexer/lexer.js");
const parser_js_1 = require("../parser/parser.js");
const analyser_js_1 = require("../semantic/analyser.js");
const compiler_js_1 = require("../bytecode/compiler.js");
const vm_js_1 = require("../vm/vm.js");
const index_js_2 = require("../stdlib/index.js");
const index_js_3 = require("../utils/index.js");
// ─── Module registry ──────────────────────────────────────────────────────────
const moduleCache = new Map();
const activeImports = new Set();
// ─── Pipeline ─────────────────────────────────────────────────────────────────
function runSource(source, opts = {}) {
    const fileName = opts.fileName ?? "<stdin>";
    const doAnalyse = opts.analyse !== false;
    const diagnostics = [];
    const reporter = new index_js_1.ErrorReporter(source, fileName);
    // ── 1. Lex ──────────────────────────────────────────────────────────────
    const lexer = new lexer_js_1.Lexer(source, fileName, reporter);
    const tokens = lexer.tokenize();
    if (reporter.hasErrors()) {
        const diags = formatDiagnostics(reporter, source, fileName);
        if (opts.printDiagnostics !== false)
            printDiagnostics(diags);
        return { ok: false, error: "Lex error", diagnostics: diags };
    }
    // ── 2. Parse ─────────────────────────────────────────────────────────────
    const edition = opts.edition ?? (fileName !== "<stdin>" ? (0, index_js_3.detectFileEdition)(fileName) : undefined);
    const parser = new parser_js_1.Parser(tokens, source, fileName, reporter, edition);
    const ast = parser.parse();
    if (reporter.hasErrors()) {
        const diags = formatDiagnostics(reporter, source, fileName);
        if (opts.printDiagnostics !== false)
            printDiagnostics(diags);
        return { ok: false, error: "Parse error", diagnostics: diags };
    }
    // ── 3. Semantic analysis ─────────────────────────────────────────────────
    if (doAnalyse) {
        const analyser = new analyser_js_1.SemanticAnalyser(reporter, source);
        analyser.analyse(ast);
    }
    // Collect warnings even if not errors
    const warnings = formatWarnings(reporter, source, fileName);
    for (const w of warnings) {
        diagnostics.push(w);
        if (opts.printDiagnostics !== false)
            process.stderr.write(w + "\n");
    }
    if (reporter.hasErrors()) {
        const diags = formatDiagnostics(reporter, source, fileName);
        if (opts.printDiagnostics !== false)
            printDiagnostics(diags);
        return { ok: false, error: "Semantic error", diagnostics: diags };
    }
    // ── 4. Compile ───────────────────────────────────────────────────────────
    const compiler = new compiler_js_1.Compiler(reporter);
    const chunk = compiler.compile(ast);
    if (reporter.hasErrors()) {
        const diags = formatDiagnostics(reporter, source, fileName);
        if (opts.printDiagnostics !== false)
            printDiagnostics(diags);
        return { ok: false, error: "Compile error", diagnostics: diags };
    }
    // ── 5. Run ───────────────────────────────────────────────────────────────
    const vm = new vm_js_1.VM(opts.output ?? ((s) => process.stdout.write(s + "\n")));
    // Register module loader
    vm.defineNative("__import__", 1, (args) => {
        return loadModule(args[0], vm, opts);
    });
    (0, index_js_2.setCurrentVm)(vm);
    let result;
    try {
        result = vm.run(chunk);
    }
    finally {
        (0, index_js_2.setCurrentVm)(null);
    }
    if (!result.ok) {
        const msg = `\nHKD Runtime Error: ${result.error}\n`;
        if (opts.printDiagnostics !== false)
            process.stderr.write(msg);
        return { ok: false, error: result.error, diagnostics };
    }
    return { ok: true, value: result.value, diagnostics };
}
// ─── File runner ──────────────────────────────────────────────────────────────
function runFile(filePath, opts = {}) {
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
        const msg = `HKD Error: File not found: ${filePath}`;
        process.stderr.write(msg + "\n");
        return { ok: false, error: msg, diagnostics: [msg] };
    }
    // Detect edition from nearby hkd.toml if not specified in opts
    let edition = opts.edition;
    if (!edition) {
        let dir = path.dirname(absPath);
        while (dir && dir !== path.dirname(dir)) {
            const tomlPath = path.join(dir, "hkd.toml");
            if (fs.existsSync(tomlPath)) {
                try {
                    const content = fs.readFileSync(tomlPath, "utf-8");
                    if (/edition\s*=\s*"2027"/.test(content)) {
                        edition = "2027";
                    }
                }
                catch {
                    // Ignore read errors and fall back
                }
                break;
            }
            dir = path.dirname(dir);
        }
    }
    const source = fs.readFileSync(absPath, "utf-8");
    return runSource(source, { ...opts, fileName: absPath, edition: edition ?? opts.edition });
}
// ─── Module loader ────────────────────────────────────────────────────────────
function loadModule(modulePath, vm, opts = {}) {
    // Check built-in stdlib first
    const stdlibModule = tryLoadStdlib(modulePath, vm);
    if (stdlibModule !== null) {
        return stdlibModule;
    }
    // Resolve absolute canonical path
    let resolvedPath = "";
    if (opts.fileName) {
        resolvedPath = path.resolve(path.dirname(opts.fileName), modulePath);
    }
    else {
        resolvedPath = path.resolve(modulePath);
    }
    // Try appending .hkd if file not found and doesn't end in .hkd
    if (!fs.existsSync(resolvedPath) && !resolvedPath.endsWith(".hkd")) {
        resolvedPath += ".hkd";
    }
    const canonicalPath = path.normalize(resolvedPath);
    // Check cache
    if (moduleCache.has(canonicalPath)) {
        return moduleCache.get(canonicalPath);
    }
    // Circular dependency detection
    if (activeImports.has(canonicalPath)) {
        throw new vm_js_1.VmError(`Circular dependency detected: ${canonicalPath}`, index_js_1.ErrorCode.E407);
    }
    activeImports.add(canonicalPath);
    try {
        if (!fs.existsSync(canonicalPath)) {
            throw new vm_js_1.VmError(`Module not found: "${modulePath}" (resolved as: "${canonicalPath}")`, index_js_1.ErrorCode.E406);
        }
        const source = fs.readFileSync(canonicalPath, "utf-8");
        const reporter = new index_js_1.ErrorReporter(source, canonicalPath);
        // 1. Lex
        const lexer = new lexer_js_1.Lexer(source, canonicalPath, reporter);
        const tokens = lexer.tokenize();
        if (reporter.hasErrors()) {
            throw new vm_js_1.VmError(`Lex error in module "${modulePath}":\n${reporter.format()}`, index_js_1.ErrorCode.E405);
        }
        // 2. Parse
        const edition = opts.edition ?? (0, index_js_3.detectFileEdition)(canonicalPath);
        const parser = new parser_js_1.Parser(tokens, source, canonicalPath, reporter, edition);
        const ast = parser.parse();
        if (reporter.hasErrors()) {
            throw new vm_js_1.VmError(`Parse error in module "${modulePath}":\n${reporter.format()}`, index_js_1.ErrorCode.E405);
        }
        // 3. Analyse
        if (opts.analyse !== false) {
            const analyser = new analyser_js_1.SemanticAnalyser(reporter, source);
            analyser.analyse(ast);
            if (reporter.hasErrors()) {
                throw new vm_js_1.VmError(`Semantic error in module "${modulePath}":\n${reporter.format()}`, index_js_1.ErrorCode.E405);
            }
        }
        // 4. Compile
        const compiler = new compiler_js_1.Compiler(reporter);
        const chunk = compiler.compile(ast);
        if (reporter.hasErrors()) {
            throw new vm_js_1.VmError(`Compile error in module "${modulePath}":\n${reporter.format()}`, index_js_1.ErrorCode.E405);
        }
        // 5. Run in a fresh, isolated VM instance
        // Share the stdout handler from parent VM if available
        const outputHandler = vm.output ?? ((s) => process.stdout.write(s + "\n"));
        const subVm = new vm_js_1.VM(outputHandler);
        // Register loader recursively on the subVM
        subVm.defineNative("__import__", 1, (subArgs) => {
            return loadModule(subArgs[0], subVm, { ...opts, fileName: canonicalPath });
        });
        (0, index_js_2.setCurrentVm)(subVm);
        let runResult;
        try {
            runResult = subVm.run(chunk);
        }
        finally {
            (0, index_js_2.setCurrentVm)(vm);
        }
        if (!runResult.ok) {
            throw new vm_js_1.VmError(`Runtime error in module "${modulePath}": ${runResult.error}`, runResult.code ?? index_js_1.ErrorCode.E405);
        }
        // Collect exported non-builtin globals
        const defaultVm = new vm_js_1.VM();
        const defaultGlobals = new Set(defaultVm.globals.keys());
        const fields = new Map();
        for (const [k, val] of subVm.globals.entries()) {
            if (!defaultGlobals.has(k)) {
                fields.set(k, val);
                vm.globals.set(k, val);
            }
        }
        const modObj = { type: "object", fields };
        moduleCache.set(canonicalPath, modObj);
        return modObj;
    }
    finally {
        activeImports.delete(canonicalPath);
    }
}
function tryLoadStdlib(name, _vm) {
    // Resolve "math", "json", "fs", "std.json", ... from the standard library so
    // that `hkd run <file>` exposes stdlib modules to HKD programs via `import`.
    return (0, index_js_2.getStdModule)(name);
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDiagnostics(reporter, source, fileName) {
    return reporter
        .getErrors()
        .map((d) => (0, index_js_1.formatDiagnostic)(d, source, fileName));
}
function formatWarnings(reporter, source, fileName) {
    return reporter
        .getWarnings()
        .map((d) => (0, index_js_1.formatDiagnostic)(d, source, fileName));
}
function printDiagnostics(diags) {
    for (const d of diags) {
        process.stderr.write(d + "\n\n");
    }
}
//# sourceMappingURL=index.js.map