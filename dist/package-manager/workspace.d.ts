/**
 * HKD Workspace Manager
 *
 * Implements multi-package workspace resolution, shared lockfiles,
 * and inter-package path dependencies.
 */
import { HkdManifest } from "./index.js";
export interface WorkspaceConfig {
    members: string[];
}
export interface WorkspaceMember {
    name: string;
    dir: string;
    manifest: HkdManifest;
}
export interface Workspace {
    rootDir: string;
    config: WorkspaceConfig;
    members: WorkspaceMember[];
}
/**
 * Checks if a project directory is configured as a workspace root.
 */
export declare function isWorkspace(rootDir: string): boolean;
/**
 * Loads a workspace and discovers all member packages.
 */
export declare function loadWorkspace(rootDir: string): Workspace | null;
/**
 * Installs all packages across a workspace with unified dependency resolution.
 */
export declare function installWorkspace(ws: Workspace, options?: {
    offline?: boolean;
}): Promise<{
    ok: boolean;
    message: string;
    member: string;
}[]>;
//# sourceMappingURL=workspace.d.ts.map