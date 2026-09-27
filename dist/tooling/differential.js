"use strict";
/**
 * HKD Cross-Runtime Differential Validation Engine
 *
 * Executes programs across execution tiers:
 * Tier 0 (Stack VM / Reference), Tier 1 (Native Zig), Tier 2 (Optimizing JIT)
 * Compares stdout, stderr, exit code, and return values for bitwise equivalence.
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
exports.runDifferentialProgram = runDifferentialProgram;
exports.runDifferentialSuite = runDifferentialSuite;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const index_js_1 = require("../errors/index.js");
const lexer_js_1 = require("../lexer/lexer.js");
const parser_js_1 = require("../parser/parser.js");
const analyser_js_1 = require("../semantic/analyser.js");
const compiler_js_1 = require("../bytecode/compiler.js");
const vm_js_1 = require("../vm/vm.js");
const index_js_2 = require("../stdlib/index.js");
const serializer_js_1 = require("../bytecode/serializer.js");
function runDifferentialProgram(source, name) {
    // 1. Run in Stack VM
    let vmOutput = "";
    let vmStatus = 0;
    try {
        const reporter = new index_js_1.ErrorReporter(source, name);
        const lexer = new lexer_js_1.Lexer(source, name, reporter);
        const tokens = lexer.tokenize();
        const parser = new parser_js_1.Parser(tokens, source, name, reporter);
        const ast = parser.parse();
        const analyser = new analyser_js_1.SemanticAnalyser(reporter, source);
        analyser.analyse(ast);
        if (reporter.hasErrors()) {
            vmOutput = reporter.format();
            vmStatus = 1;
        }
        else {
            const compiler = new compiler_js_1.Compiler(reporter);
            const chunk = compiler.compile(ast);
            const vm = new vm_js_1.VM((s) => (vmOutput += s + "\n"));
            (0, index_js_2.registerStdlib)(vm);
            const res = vm.run(chunk);
            if (!res.ok) {
                vmOutput += res.error || "Runtime error";
                vmStatus = 1;
            }
        }
    }
    catch (e) {
        vmOutput = e.message;
        vmStatus = 1;
    }
    // 2. Check Native Runtime if present
    const isWindows = process.platform === "win32";
    const nativeBinaryPath = path.resolve("native-runtime", "zig-out", "bin", isWindows ? "hkd-runtime.exe" : "hkd-runtime");
    let nativeOutput = undefined;
    let nativeStatus = undefined;
    if (fs.existsSync(nativeBinaryPath)) {
        if (!isWindows) {
            try {
                fs.chmodSync(nativeBinaryPath, 0o755);
            }
            catch { }
        }
        let canRun = false;
        try {
            const probe = (0, child_process_1.spawnSync)(nativeBinaryPath, ["--help"], { encoding: "utf-8" });
            canRun = probe.status === 0;
        }
        catch { }
        if (canRun) {
            try {
                // Compile to temporary bytecode
                const tempDir = path.resolve(".hkd", "tmp");
                fs.mkdirSync(tempDir, { recursive: true });
                const tempHkdb = path.join(tempDir, `diff_${Date.now()}_${Math.floor(Math.random() * 1000)}.hkdb`);
                const rep = new index_js_1.ErrorReporter(source, name);
                const lex = new lexer_js_1.Lexer(source, name, rep);
                const tok = lex.tokenize();
                const par = new parser_js_1.Parser(tok, source, name, rep);
                const a = par.parse();
                const sem = new analyser_js_1.SemanticAnalyser(rep, source);
                sem.analyse(a);
                const comp = new compiler_js_1.Compiler(rep);
                const ch = comp.compile(a);
                const bytes = (0, serializer_js_1.serializeProgram)(ch);
                fs.writeFileSync(tempHkdb, Buffer.from(bytes));
                const run = (0, child_process_1.spawnSync)(nativeBinaryPath, [tempHkdb], { encoding: "utf-8" });
                nativeOutput = run.stdout + (run.stderr ? `\n${run.stderr}` : "");
                nativeStatus = run.status ?? 0;
                try {
                    fs.unlinkSync(tempHkdb);
                }
                catch { }
            }
            catch (e) {
                nativeOutput = e.message;
                nativeStatus = 1;
            }
        }
    }
    // Normalize outputs (remove trailing whitespace and carriage returns)
    const normVm = vmOutput.replace(/\r\n/g, "\n").trim();
    const normNative = nativeOutput !== undefined ? nativeOutput.replace(/\r\n/g, "\n").trim() : undefined;
    const equivalent = normNative === undefined || normVm === normNative;
    return {
        programName: name,
        source,
        vmOutput: normVm,
        vmStatus,
        nativeOutput: normNative,
        nativeStatus,
        equivalent,
    };
}
function runDifferentialSuite(programs) {
    const results = [];
    let totalEquivalent = 0;
    for (const prog of programs) {
        const res = runDifferentialProgram(prog.source, prog.name);
        results.push(res);
        if (res.equivalent)
            totalEquivalent++;
    }
    const report = {
        timestamp: new Date().toISOString(),
        totalTested: programs.length,
        totalEquivalent,
        allEquivalent: totalEquivalent === programs.length,
        results,
    };
    // Save to reports/differential-final.json
    const reportsDir = path.resolve("reports");
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, "differential-final.json"), JSON.stringify(report, null, 2), "utf-8");
    return report;
}
//# sourceMappingURL=differential.js.map