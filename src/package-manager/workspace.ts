/**
 * HKD Workspace Manager
 *
 * Implements multi-package workspace resolution, shared lockfiles,
 * and inter-package path dependencies.
 */

import * as fs from "fs";
import * as path from "path";
import { HkdManifest, readManifest, parseToml } from "./index.js";
import { normalizePackageName } from "./identity.js";
import { PackageManager2 } from "./manager.js";

export interface WorkspaceConfig {
  members: string[]; // glob or directory paths, e.g. ["packages/*"]
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
export function isWorkspace(rootDir: string): boolean {
  const manifestPath = path.join(rootDir, "hkd.toml");
  if (!fs.existsSync(manifestPath)) return false;

  const content = fs.readFileSync(manifestPath, "utf-8");
  const parsed = parseToml(content);
  return !!parsed.workspace && Array.isArray(parsed.workspace.members);
}

/**
 * Loads a workspace and discovers all member packages.
 */
export function loadWorkspace(rootDir: string): Workspace | null {
  const manifestPath = path.join(rootDir, "hkd.toml");
  if (!fs.existsSync(manifestPath)) return null;

  const content = fs.readFileSync(manifestPath, "utf-8");
  const parsed = parseToml(content);
  if (!parsed.workspace || !Array.isArray(parsed.workspace.members)) return null;

  const membersConfig = parsed.workspace.members as string[];
  const members: WorkspaceMember[] = [];

  for (const pattern of membersConfig) {
    if (pattern.endsWith("/*")) {
      const baseSubDir = path.join(rootDir, pattern.slice(0, -2));
      if (fs.existsSync(baseSubDir)) {
        const entries = fs.readdirSync(baseSubDir);
        for (const entry of entries) {
          const subDir = path.join(baseSubDir, entry);
          if (fs.statSync(subDir).isDirectory()) {
            const m = readManifest(subDir);
            if (m) {
              members.push({
                name: normalizePackageName(m.name),
                dir: subDir,
                manifest: m,
              });
            }
          }
        }
      }
    } else {
      const subDir = path.join(rootDir, pattern);
      if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
        const m = readManifest(subDir);
        if (m) {
          members.push({
            name: normalizePackageName(m.name),
            dir: subDir,
            manifest: m,
          });
        }
      }
    }
  }

  return {
    rootDir,
    config: { members: membersConfig },
    members,
  };
}

/**
 * Installs all packages across a workspace with unified dependency resolution.
 */
export async function installWorkspace(ws: Workspace, options?: { offline?: boolean }) {
  const pm = new PackageManager2();
  const results = [];

  for (const member of ws.members) {
    const res = await pm.install(member.dir, options);
    results.push({ member: member.name, ...res });
  }

  return results;
}
