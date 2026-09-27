/**
 * HKD LSP Workspace Graph & Authoritative Module Resolver
 *
 * Discovers projects, workspace members, installed packages (.hkd/deps),
 * and vendored dependencies (vendor/). Provides 100% resolution parity with
 * the compiler and package manager.
 */
export interface PackageExport {
    name: string;
    kind: "function" | "struct" | "variable" | "constant";
    detail: string;
}
export declare class WorkspaceGraph {
    workspaceRoots: string[];
    constructor(roots?: string[]);
    setRoots(roots: string[]): void;
    /**
     * Finds the enclosing HKD project directory (containing hkd.toml) for a given file.
     */
    findProjectRoot(filePath: string): string | null;
    /**
     * Authoritative module resolver matching compiler semantics 1:1.
     */
    resolveImport(fromFilePath: string, importSpec: string): string | null;
    /**
     * Lists all available package dependencies for the project.
     */
    getAvailablePackages(fromFilePath: string): string[];
    /**
     * Discovers exported symbols from a package or module file.
     */
    getPackageExports(fromFilePath: string, pkgName: string): PackageExport[];
}
//# sourceMappingURL=workspace-graph.d.ts.map