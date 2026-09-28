/**
 * HKD Runtime
 *
 * The high-level pipeline: source → lex → parse → analyse → compile → run.
 * This is the single entry point for executing HKD programs.
 */
import { VM } from "../vm/vm.js";
import { RegisterVM } from "../vm/vm_register.js";
import { HkdValue } from "../bytecode/chunk.js";
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
export declare function runSource(source: string, opts?: RunOptions): RunResult;
export declare function runFile(filePath: string, opts?: RunOptions): RunResult;
export declare function loadModule(modulePath: string, vm: VM | RegisterVM, opts?: RunOptions): HkdValue;
//# sourceMappingURL=index.d.ts.map