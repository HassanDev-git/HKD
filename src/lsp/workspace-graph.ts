/**
 * HKD LSP Workspace Graph & Authoritative Module Resolver
 *
 * Discovers projects, workspace members, installed packages (.hkd/deps),
 * and vendored dependencies (vendor/). Provides 100% resolution parity with
 * the compiler and package manager.
 */

import * as fs from "fs";
import * as path from "path";
import { readManifest, HkdManifest } from "../package-manager/index.js";
import { isWorkspace, loadWorkspace } from "../package-manager/workspace.js";
import { Lexer } from "../lexer/lexer.js";
import { Parser } from "../parser/parser.js";
import { ErrorReporter } from "../errors/index.js";

export interface PackageExport {
  name: string;
  kind: "function" | "struct" | "variable" | "constant";
  detail: string;
}

export class WorkspaceGraph {
  public workspaceRoots: string[] = [];

  constructor(roots: string[] = []) {
    this.workspaceRoots = roots.map((r) => path.resolve(r));
  }

  public setRoots(roots: string[]): void {
    this.workspaceRoots = roots.map((r) => path.resolve(r));
  }

  /**
   * Finds the enclosing HKD project directory (containing hkd.toml) for a given file.
   */
  public findProjectRoot(filePath: string): string | null {
    let curr = path.dirname(path.resolve(filePath));
    while (true) {
      if (fs.existsSync(path.join(curr, "hkd.toml"))) {
        return curr;
      }
      const parent = path.dirname(curr);
      if (parent === curr) break;
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
  public resolveImport(fromFilePath: string, importSpec: string): string | null {
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
    if (!projectRoot) return null;

    const baseDirs = [
      path.join(projectRoot, ".hkd", "deps", importSpec),
      path.join(projectRoot, "vendor", importSpec),
    ];

    // Check workspace member packages if this project is a workspace
    if (isWorkspace(projectRoot)) {
      const ws = loadWorkspace(projectRoot);
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
        const manifest = readManifest(pkgDir);
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
  public getAvailablePackages(fromFilePath: string): string[] {
    const projectRoot = this.findProjectRoot(fromFilePath);
    if (!projectRoot) return [];

    const pkgs: Set<string> = new Set();

    // From hkd.toml
    const manifest = readManifest(projectRoot);
    if (manifest) {
      for (const k of Object.keys(manifest.dependencies || {})) pkgs.add(k);
      for (const k of Object.keys(manifest.devDependencies || {})) pkgs.add(k);
    }

    // From .hkd/deps/
    const depsDir = path.join(projectRoot, ".hkd", "deps");
    if (fs.existsSync(depsDir)) {
      for (const d of fs.readdirSync(depsDir)) pkgs.add(d);
    }

    // From vendor/
    const vendorDir = path.join(projectRoot, "vendor");
    if (fs.existsSync(vendorDir)) {
      for (const d of fs.readdirSync(vendorDir)) pkgs.add(d);
    }

    return Array.from(pkgs).sort();
  }

  /**
   * Discovers exported symbols from a package or module file.
   */
  public getPackageExports(fromFilePath: string, pkgName: string): PackageExport[] {
    const resolvedPath = this.resolveImport(fromFilePath, pkgName);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) return [];

    try {
      const src = fs.readFileSync(resolvedPath, "utf-8");
      const reporter = new ErrorReporter(src, resolvedPath);
      const lexer = new Lexer(src, resolvedPath, reporter);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, src, resolvedPath, reporter);
      const ast = parser.parse();

      const exports: PackageExport[] = [];
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
        } else if (stmt.kind === "StructDeclStmt") {
          exports.push({
            name: stmt.name,
            kind: "struct",
            detail: `struct ${stmt.name}`,
          });
        } else if (stmt.kind === "VarDeclStmt") {
          exports.push({
            name: stmt.name,
            kind: "variable",
            detail: `let ${stmt.name}`,
          });
        } else if (stmt.kind === "ConstDeclStmt") {
          exports.push({
            name: stmt.name,
            kind: "constant",
            detail: `const ${stmt.name}`,
          });
        }
      }
      return exports;
    } catch {
      return [];
    }
  }
}
