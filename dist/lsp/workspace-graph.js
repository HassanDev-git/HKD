"use strict";
/**
 * HKD LSP Workspace Graph & Authoritative Module Resolver
 *
 * Discovers projects, workspace members, installed packages (.hkd/deps),
 * and vendored dependencies (vendor/). Provides 100% resolution parity with
 * the compiler and package manager.
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
exports.WorkspaceGraph = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const index_js_1 = require("../package-manager/index.js");
const workspace_js_1 = require("../package-manager/workspace.js");
const lexer_js_1 = require("../lexer/lexer.js");
const parser_js_1 = require("../parser/parser.js");
const index_js_2 = require("../errors/index.js");
class WorkspaceGraph {
    workspaceRoots = [];
    constructor(roots = []) {
        this.workspaceRoots = roots.map((r) => path.resolve(r));
    }
    setRoots(roots) {
        this.workspaceRoots = roots.map((r) => path.resolve(r));
    }
    /**
     * Finds the enclosing HKD project directory (containing hkd.toml) for a given file.
     */
    findProjectRoot(filePath) {
        let curr = path.dirname(path.resolve(filePath));
        while (true) {
            if (fs.existsSync(path.join(curr, "hkd.toml"))) {
                return curr;
            }
            const parent = path.dirname(curr);
            if (parent === curr)
                break;
            curr = parent;
        }
        // Fall back to first matching workspace root if inside one
        for (const root of this.workspaceRoots) {
            if (filePath.startsWith(root)) {
                return root;
            }
        }
        return null;
    }
    /**
     * Authoritative module resolver matching compiler semantics 1:1.
     */
    resolveImport(fromFilePath, importSpec) {
        const dir = path.dirname(path.resolve(fromFilePath));
        // 1. Relative import (./ or ../)
        if (importSpec.startsWith("./") || importSpec.startsWith("../") || path.isAbsolute(importSpec)) {
            const candidates = [
                path.resolve(dir, importSpec),
                path.resolve(dir, `${importSpec}.hkd`),
                path.resolve(dir, importSpec, "index.hkd"),
                path.resolve(dir, importSpec, "main.hkd"),
            ];
            for (const cand of candidates) {
                if (fs.existsSync(cand) && !fs.statSync(cand).isDirectory()) {
                    return cand;
                }
            }
            return null;
        }
        // 2. Package import (from .hkd/deps/ or vendor/ or workspace)
        const projectRoot = this.findProjectRoot(fromFilePath);
        if (!projectRoot)
            return null;
        const baseDirs = [
            path.join(projectRoot, ".hkd", "deps", importSpec),
            path.join(projectRoot, "vendor", importSpec),
        ];
        // Check workspace member packages if this project is a workspace
        if ((0, workspace_js_1.isWorkspace)(projectRoot)) {
            const ws = (0, workspace_js_1.loadWorkspace)(projectRoot);
            if (ws) {
                for (const member of ws.members) {
                    if (member.name === importSpec) {
                        baseDirs.unshift(member.dir);
                    }
                }
            }
        }
        for (const pkgDir of baseDirs) {
            if (fs.existsSync(pkgDir) && fs.statSync(pkgDir).isDirectory()) {
                const manifest = (0, index_js_1.readManifest)(pkgDir);
                const mainRel = manifest?.main || "src/main.hkd";
                const mainPath = path.resolve(pkgDir, mainRel);
                if (fs.existsSync(mainPath)) {
                    return mainPath;
                }
            }
        }
        return null;
    }
    /**
     * Lists all available package dependencies for the project.
     */
    getAvailablePackages(fromFilePath) {
        const projectRoot = this.findProjectRoot(fromFilePath);
        if (!projectRoot)
            return [];
        const pkgs = new Set();
        // From hkd.toml
        const manifest = (0, index_js_1.readManifest)(projectRoot);
        if (manifest) {
            for (const k of Object.keys(manifest.dependencies || {}))
                pkgs.add(k);
            for (const k of Object.keys(manifest.devDependencies || {}))
                pkgs.add(k);
        }
        // From .hkd/deps/
        const depsDir = path.join(projectRoot, ".hkd", "deps");
        if (fs.existsSync(depsDir)) {
            for (const d of fs.readdirSync(depsDir))
                pkgs.add(d);
        }
        // From vendor/
        const vendorDir = path.join(projectRoot, "vendor");
        if (fs.existsSync(vendorDir)) {
            for (const d of fs.readdirSync(vendorDir))
                pkgs.add(d);
        }
        return Array.from(pkgs).sort();
    }
    /**
     * Discovers exported symbols from a package or module file.
     */
    getPackageExports(fromFilePath, pkgName) {
        const resolvedPath = this.resolveImport(fromFilePath, pkgName);
        if (!resolvedPath || !fs.existsSync(resolvedPath))
            return [];
        try {
            const src = fs.readFileSync(resolvedPath, "utf-8");
            const reporter = new index_js_2.ErrorReporter(src, resolvedPath);
            const lexer = new lexer_js_1.Lexer(src, resolvedPath, reporter);
            const tokens = lexer.tokenize();
            const parser = new parser_js_1.Parser(tokens, src, resolvedPath, reporter);
            const ast = parser.parse();
            const exports = [];
            for (const stmt of ast.statements) {
                if (stmt.kind === "FunctionDeclStmt") {
                    const params = stmt.params
                        .map((p) => p.name + (p.typeAnnotation ? `: ${p.typeAnnotation.kind}` : ""))
                        .join(", ");
                    exports.push({
                        name: stmt.name,
                        kind: "function",
                        detail: `fn ${stmt.name}(${params})`,
                    });
                }
                else if (stmt.kind === "StructDeclStmt") {
                    exports.push({
                        name: stmt.name,
                        kind: "struct",
                        detail: `struct ${stmt.name}`,
                    });
                }
                else if (stmt.kind === "VarDeclStmt") {
                    exports.push({
                        name: stmt.name,
                        kind: "variable",
                        detail: `let ${stmt.name}`,
                    });
                }
                else if (stmt.kind === "ConstDeclStmt") {
                    exports.push({
                        name: stmt.name,
                        kind: "constant",
                        detail: `const ${stmt.name}`,
                    });
                }
            }
            return exports;
        }
        catch {
            return [];
        }
    }
}
exports.WorkspaceGraph = WorkspaceGraph;
//# sourceMappingURL=workspace-graph.js.map