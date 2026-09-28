/**
 * HKD Bytecode Compiler
 *
 * Walks the AST and emits HKD bytecode into Chunks.
 *
 * Design:
 *   - One Chunk per function (including top-level script)
 *   - Locals tracked in a slot array (stack-based allocation)
 *   - Globals for top-level declarations
 *   - Break/continue patching via backpatch lists
 */
import * as N from "../ast/nodes.js";
import { Chunk } from "./chunk.js";
import { ErrorReporter } from "../errors/index.js";
import { OptimizerPipeline, OptimizerOptions } from "./optimizer.js";
export declare class Compiler {
    private frames;
    private reporter;
    private isModule;
    private methodToStruct;
    private genericFunctions;
    private compiledSpecializations;
    private currentSpecializedReceiverStruct;
    private currentStruct;
    private loadedImportPaths;
    private optimizer;
    constructor(reporter: ErrorReporter, isModule?: boolean, optimizerOptions?: OptimizerOptions);
    getOptimizer(): OptimizerPipeline;
    private loadImportedAst;
    private scanImportedAst;
    compile(program: N.Program): Chunk;
    private get frame();
    private get chunk();
    private emit;
    private emitU16;
    private emitConst;
    private emitJump;
    private patchJump;
    private line;
    private nameConst;
    private compileStmt;
    private compileVarDecl;
    private compileConstDecl;
    private compileFunctionDecl;
    private compileFunction;
    /**
     * Emit the value for a function value. Functions with no captured upvalues are
     * emitted as a plain constant; functions that capture upvalues are emitted via
     * MAKE_CLOSURE together with their upvalue descriptors so the VM can bind the
     * captured variables at closure-creation time.
     */
    private emitClosure;
    private compileStructDecl;
    private compileImplBlock;
    private compileReturn;
    private compileBreak;
    private compileContinue;
    private compileIfStmt;
    private compileWhile;
    private compileFor;
    private compileBlock;
    private compileExprStmt;
    private compileImport;
    private compileTest;
    private compileAssert;
    private compileExpr;
    private compileIdentLoad;
    private compileBinary;
    private compileUnary;
    private compileCall;
    private compileAssign;
    private compileCompoundAssign;
    private compileIfExpr;
    private compileMatchExpr;
    private compilePatternCondition;
    private bindPatternIdentifiers;
    private declareVariable;
}
export declare function compile(program: N.Program, reporter?: ErrorReporter): Chunk;
//# sourceMappingURL=compiler.d.ts.map