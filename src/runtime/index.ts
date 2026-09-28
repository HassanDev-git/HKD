/**
 * HKD Runtime
 *
 * The high-level pipeline: source → lex → parse → analyse → compile → run.
 * This is the single entry point for executing HKD programs.
 */

import * as path from "path";
import * as fs from "fs";
import { ErrorReporter, formatDiagnostic, ErrorCode } from "../errors/index.js";
import { Lexer } from "../lexer/lexer.js";
import { TokenKind } from "../lexer/token.js";
import { Parser } from "../parser/parser.js";
import { SemanticAnalyser } from "../semantic/analyser.js";
import { Compiler } from "../bytecode/compiler.js";
import { VM, VmError } from "../vm/vm.js";
import { RegisterVM } from "../vm/vm_register.js";
import { lowerToRegisterChunk } from "../bytecode/register_lowering.js";
import { HkdValue, HkdObject } from "../bytecode/chunk.js";
import { getStdModule, setCurrentVm } from "../stdlib/index.js";
import { detectFileEdition } from "../utils/index.js";

// ─── Run options ──────────────────────────────────────────────────────────────

export interface RunOptions {
  /** File path for error reporting */
  fileName?: string;
  /** Whether to run semantic analysis (default: true) */
  analyse?: boolean;
  /** Print diagnostics to stderr (default: true) */
  printDiagnostics?: boolean;
  /** Override stdout output function */
  output?: (s: string) => void;
  /** Suppress exit(1) on error (useful in REPL/tests) */
  noExit?: boolean;
  /** Language edition to target (default: 2026) */
  edition?: "2026" | "2027";
  /** VM Architecture: "stack" (default) or "register" (Phase 9C experimental) */
  vm?: "stack" | "register";
}

export interface RunResult {
  ok: boolean;
  value?: HkdValue;
  error?: string;
  diagnostics: string[];
}

// ─── Module registry ──────────────────────────────────────────────────────────

const moduleCache = new Map<string, HkdValue>();
const activeImports = new Set<string>();

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export function runSource(source: string, opts: RunOptions = {}): RunResult {
  const fileName = opts.fileName ?? "<stdin>";
  const doAnalyse = opts.analyse !== false;
  const diagnostics: string[] = [];

  const reporter = new ErrorReporter(source, fileName);

  // ── 1. Lex ──────────────────────────────────────────────────────────────
  const lexer = new Lexer(source, fileName, reporter);
  const tokens = lexer.tokenize();

  if (reporter.hasErrors()) {
    const diags = formatDiagnostics(reporter, source, fileName);
    if (opts.printDiagnostics !== false) printDiagnostics(diags);
    return { ok: false, error: "Lex error", diagnostics: diags };
  }

  // ── 2. Parse ─────────────────────────────────────────────────────────────
  const edition = opts.edition ?? (fileName !== "<stdin>" ? detectFileEdition(fileName) : undefined);
  const parser = new Parser(tokens, source, fileName, reporter, edition);
  const ast = parser.parse();

  if (reporter.hasErrors()) {
    const diags = formatDiagnostics(reporter, source, fileName);
    if (opts.printDiagnostics !== false) printDiagnostics(diags);
    return { ok: false, error: "Parse error", diagnostics: diags };
  }

  // ── 3. Semantic analysis ─────────────────────────────────────────────────
  if (doAnalyse) {
    const analyser = new SemanticAnalyser(reporter, source);
    analyser.analyse(ast);
  }

  // Collect warnings even if not errors
  const warnings = formatWarnings(reporter, source, fileName);
  for (const w of warnings) {
    diagnostics.push(w);
    if (opts.printDiagnostics !== false) process.stderr.write(w + "\n");
  }

  if (reporter.hasErrors()) {
    const diags = formatDiagnostics(reporter, source, fileName);
    if (opts.printDiagnostics !== false) printDiagnostics(diags);
    return { ok: false, error: "Semantic error", diagnostics: diags };
  }

  // ── 4. Compile ───────────────────────────────────────────────────────────
  const compiler = new Compiler(reporter);
  const chunk = compiler.compile(ast);

  if (reporter.hasErrors()) {
    const diags = formatDiagnostics(reporter, source, fileName);
    if (opts.printDiagnostics !== false) printDiagnostics(diags);
    return { ok: false, error: "Compile error", diagnostics: diags };
  }

  // ── 5. Run ───────────────────────────────────────────────────────────────
  const vmKind = opts.vm ?? (process.env.HKD_VM === "register" ? "register" : "stack");
  const outputHandler = opts.output ?? ((s) => process.stdout.write(s + "\n"));
  const vm = vmKind === "register" ? new RegisterVM(outputHandler) : new VM(outputHandler);

  // Register module loader
  vm.defineNative("__import__", 1, (args) => {
    return loadModule(args[0] as string, vm, opts);
  });

  setCurrentVm(vm);
  let result;
  try {
    if (vmKind === "register") {
      const regChunk = lowerToRegisterChunk(chunk);
      result = (vm as RegisterVM).run(regChunk);
    } else {
      result = (vm as VM).run(chunk);
    }
  } finally {
    setCurrentVm(null);
  }

  if (!result.ok) {
    const msg = `\nHKD Runtime Error: ${result.error}\n`;
    if (opts.printDiagnostics !== false) process.stderr.write(msg);
    return { ok: false, error: result.error, diagnostics };
  }

  return { ok: true, value: result.value, diagnostics };
}

// ─── File runner ──────────────────────────────────────────────────────────────

export function runFile(filePath: string, opts: RunOptions = {}): RunResult {
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
        } catch {
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

export function loadModule(modulePath: string, vm: VM | RegisterVM, opts: RunOptions = {}): HkdValue {
  // Check built-in stdlib first
  const stdlibModule = tryLoadStdlib(modulePath, vm);
  if (stdlibModule !== null) {
    return stdlibModule;
  }

  // Resolve absolute canonical path
  let resolvedPath = "";
  if (opts.fileName) {
    resolvedPath = path.resolve(path.dirname(opts.fileName), modulePath);
  } else {
    resolvedPath = path.resolve(modulePath);
  }

  // Try appending .hkd if file not found and doesn't end in .hkd
  if (!fs.existsSync(resolvedPath) && !resolvedPath.endsWith(".hkd")) {
    resolvedPath += ".hkd";
  }

  const canonicalPath = path.normalize(resolvedPath);

  // Check cache
  if (moduleCache.has(canonicalPath)) {
    return moduleCache.get(canonicalPath)!;
  }

  // Circular dependency detection
  if (activeImports.has(canonicalPath)) {
    throw new VmError(`Circular dependency detected: ${canonicalPath}`, ErrorCode.E407);
  }

  activeImports.add(canonicalPath);

  try {
    if (!fs.existsSync(canonicalPath)) {
      throw new VmError(`Module not found: "${modulePath}" (resolved as: "${canonicalPath}")`, ErrorCode.E406);
    }

    const source = fs.readFileSync(canonicalPath, "utf-8");
    const reporter = new ErrorReporter(source, canonicalPath);

    // 1. Lex
    const lexer = new Lexer(source, canonicalPath, reporter);
    const tokens = lexer.tokenize();
    if (reporter.hasErrors()) {
      throw new VmError(`Lex error in module "${modulePath}":\n${reporter.format()}`, ErrorCode.E405);
    }

    // 2. Parse
    const edition = opts.edition ?? detectFileEdition(canonicalPath);
    const parser = new Parser(tokens, source, canonicalPath, reporter, edition);
    const ast = parser.parse();
    if (reporter.hasErrors()) {
      throw new VmError(`Parse error in module "${modulePath}":\n${reporter.format()}`, ErrorCode.E405);
    }

    // 3. Analyse
    if (opts.analyse !== false) {
      const analyser = new SemanticAnalyser(reporter, source);
      analyser.analyse(ast);
      if (reporter.hasErrors()) {
        throw new VmError(`Semantic error in module "${modulePath}":\n${reporter.format()}`, ErrorCode.E405);
      }
    }

    // 4. Compile
    const compiler = new Compiler(reporter);
    const chunk = compiler.compile(ast);
    if (reporter.hasErrors()) {
      throw new VmError(`Compile error in module "${modulePath}":\n${reporter.format()}`, ErrorCode.E405);
    }

    // 5. Run in a fresh, isolated VM instance
    const vmKind = opts.vm ?? (process.env.HKD_VM === "register" ? "register" : "stack");
    const outputHandler = (vm as any).output ?? ((s: string) => process.stdout.write(s + "\n"));
    const subVm = vmKind === "register" ? new RegisterVM(outputHandler) : new VM(outputHandler);

    // Register loader recursively on the subVM
    subVm.defineNative("__import__", 1, (subArgs) => {
      return loadModule(subArgs[0] as string, subVm, { ...opts, fileName: canonicalPath });
    });

    setCurrentVm(subVm);
    let runResult;
    try {
      if (vmKind === "register") {
        runResult = (subVm as RegisterVM).run(lowerToRegisterChunk(chunk));
      } else {
        runResult = (subVm as VM).run(chunk);
      }
    } finally {
      setCurrentVm(vm);
    }
    if (!runResult.ok) {
      throw new VmError(`Runtime error in module "${modulePath}": ${runResult.error}`, (runResult as any).code ?? ErrorCode.E405);
    }

    // Collect exported non-builtin globals
    const defaultVm = new VM();
    const defaultGlobals = new Set((defaultVm as any).globals.keys());
    const fields = new Map<string, HkdValue>();

    for (const [k, val] of (subVm as any).globals.entries()) {
      if (!defaultGlobals.has(k)) {
        fields.set(k, val);
        (vm as any).globals.set(k, val);
      }
    }

    const modObj: HkdObject = { type: "object", fields };
    moduleCache.set(canonicalPath, modObj);
    return modObj;
  } finally {
    activeImports.delete(canonicalPath);
  }
}

function tryLoadStdlib(name: string, _vm: VM | RegisterVM): HkdValue | null {
  // Resolve "math", "json", "fs", "std.json", ... from the standard library so
  // that `hkd run <file>` exposes stdlib modules to HKD programs via `import`.
  return getStdModule(name);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDiagnostics(
  reporter: ErrorReporter,
  source: string,
  fileName: string
): string[] {
  return reporter
    .getErrors()
    .map((d) => formatDiagnostic(d, source, fileName));
}

function formatWarnings(
  reporter: ErrorReporter,
  source: string,
  fileName: string
): string[] {
  return reporter
    .getWarnings()
    .map((d) => formatDiagnostic(d, source, fileName));
}

function printDiagnostics(diags: string[]): void {
  for (const d of diags) {
    process.stderr.write(d + "\n\n");
  }
}
