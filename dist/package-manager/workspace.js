"use strict";
/**
 * HKD Workspace Manager
 *
 * Implements multi-package workspace resolution, shared lockfiles,
 * and inter-package path dependencies.
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
exports.isWorkspace = isWorkspace;
exports.loadWorkspace = loadWorkspace;
exports.installWorkspace = installWorkspace;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const index_js_1 = require("./index.js");
const identity_js_1 = require("./identity.js");
const manager_js_1 = require("./manager.js");
/**
 * Checks if a project directory is configured as a workspace root.
 */
function isWorkspace(rootDir) {
    const manifestPath = path.join(rootDir, "hkd.toml");
    if (!fs.existsSync(manifestPath))
        return false;
    const content = fs.readFileSync(manifestPath, "utf-8");
    const parsed = (0, index_js_1.parseToml)(content);
    return !!parsed.workspace && Array.isArray(parsed.workspace.members);
}
/**
 * Loads a workspace and discovers all member packages.
 */
function loadWorkspace(rootDir) {
    const manifestPath = path.join(rootDir, "hkd.toml");
    if (!fs.existsSync(manifestPath))
        return null;
    const content = fs.readFileSync(manifestPath, "utf-8");
    const parsed = (0, index_js_1.parseToml)(content);
    if (!parsed.workspace || !Array.isArray(parsed.workspace.members))
        return null;
    const membersConfig = parsed.workspace.members;
    const members = [];
    for (const pattern of membersConfig) {
        if (pattern.endsWith("/*")) {
            const baseSubDir = path.join(rootDir, pattern.slice(0, -2));
            if (fs.existsSync(baseSubDir)) {
                const entries = fs.readdirSync(baseSubDir);
                for (const entry of entries) {
                    const subDir = path.join(baseSubDir, entry);
                    if (fs.statSync(subDir).isDirectory()) {
                        const m = (0, index_js_1.readManifest)(subDir);
                        if (m) {
                            members.push({
                                name: (0, identity_js_1.normalizePackageName)(m.name),
                                dir: subDir,
                                manifest: m,
                            });
                        }
                    }
                }
            }
        }
        else {
            const subDir = path.join(rootDir, pattern);
            if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
                const m = (0, index_js_1.readManifest)(subDir);
                if (m) {
                    members.push({
                        name: (0, identity_js_1.normalizePackageName)(m.name),
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
async function installWorkspace(ws, options) {
    const pm = new manager_js_1.PackageManager2();
    const results = [];
    for (const member of ws.members) {
        const res = await pm.install(member.dir, options);
        results.push({ member: member.name, ...res });
    }
    return results;
}
//# sourceMappingURL=workspace.js.map