/**
 * HKD Semantic Analyser
 *
 * Walks the AST and performs:
 *  1. Name resolution (undefined variable / function detection)
 *  2. Type inference (for untyped declarations)
 *  3. Type checking (mismatched operands, bad assignments, etc.)
 *  4. Control-flow checks (return outside fn, break outside loop)
 *  5. Unused variable warnings
 *  6. Duplicate declaration detection
 */
import * as N from "../ast/nodes.js";
import { ErrorReporter, SourceSpan } from "../errors/index.js";
import { HkdType } from "./types.js";
export declare const UNIQUE_STDLIB_SYMBOLS: Record<string, string>;
export declare const AMBIGUOUS_STDLIB_SYMBOLS: Set<string>;
export interface TraitMethodInfo {
    params: HkdType[];
    returnType: HkdType;
    paramNames: string[];
    span: SourceSpan;
}
export interface TraitDef {
    name: string;
    methods: Map<string, TraitMethodInfo>;
    span: SourceSpan;
}
export declare class SemanticAnalyser {
    private readonly reporter;
    private readonly source;
    private scope;
    private structs;
    private structMethods;
    private traits;
    private structTraits;
    private traitImpls;
    private currentFunctionReturn;
    private currentFunctionIsAsync;
    private importedModules;
    private loadedImportPaths;
    constructor(reporter: ErrorReporter, source: string);
    private scanImportedAst;
    analyse(program: N.Program): void;
    private hoistDeclarations;
    private hoistTraitDecl;
    private hoistImplBlock;
    private analyseStmt;
    private analyseImplBlock;
    private analyseMethod;
    /**
       * Register an imported module in the current scope so that its members can be
       * referenced. Bare imports bound the whole module to `defaultName` (the only
       * form the runtime currently wires up), which is typed as dynamic (Any).
       */
    private analyseImport;
    private analyseVarDecl;
    private analyseConstDecl;
    private analyseFunctionDecl;
    private analyseReturn;
    private analyseBreak;
    private analyseContinue;
    private analyseIfStmt;
    private analyseWhile;
    private analyseFor;
    private analyseBlock;
    private analyseTest;
    private analyseAssert;
    private analyseExpr;
    private analyseExprInternal;
    private analyseAwaitExpr;
    private analyseBinary;
    private analyseUnary;
    private analyseCall;
    private analyseIndex;
    private analyseMember;
    private analyseAssign;
    private analyseCompoundAssign;
    private analyseArray;
    private analyseObject;
    private analyseFunctionExpr;
    private analyseIfExpr;
    private analyseBlockExpr;
    private analyseStructInit;
    private analyseMatchExpr;
    private checkPattern;
    private typeMismatch;
    private typeError;
    private warnUnused;
    private collectAllNames;
}
export declare function analyse(program: N.Program, source: string, reporter?: ErrorReporter): void;
//# sourceMappingURL=analyser.d.ts.map