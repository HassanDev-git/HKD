"use strict";
/**
 * HKD Mock Package Registry Client
 *
 * Implements an in-memory, fully-featured RegistryClient for tests,
 * offline simulation, and local package repository serving.
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
exports.MockRegistryClient = void 0;
const crypto = __importStar(require("crypto"));
const identity_js_1 = require("../identity.js");
class MockRegistryClient {
    packages = new Map();
    archives = new Map(); // "name@version" -> Buffer
    constructor() { }
    async getPackageMetadata(rawName) {
        const name = (0, identity_js_1.normalizePackageName)(rawName);
        const meta = this.packages.get(name);
        return meta ? JSON.parse(JSON.stringify(meta)) : null;
    }
    async downloadPackage(rawName, version) {
        const name = (0, identity_js_1.normalizePackageName)(rawName);
        const key = `${name}@${version}`;
        const buf = this.archives.get(key);
        if (!buf) {
            throw new Error(`error[REG004]: Package '${key}' not found in registry`);
        }
        const digest = crypto.createHash("sha256").update(buf).digest("hex");
        return {
            buffer: buf,
            checksum: `sha256:${digest}`,
        };
    }
    async publishPackage(manifest, archiveBuf, _token) {
        const name = (0, identity_js_1.normalizePackageName)(manifest.name);
        const version = manifest.version;
        const key = `${name}@${version}`;
        let meta = this.packages.get(name);
        if (!meta) {
            meta = {
                name,
                description: manifest.description,
                versions: {},
                distTags: {},
            };
            this.packages.set(name, meta);
        }
        // Immutability check: cannot overwrite existing version
        if (meta.versions[version]) {
            return {
                ok: false,
                message: `error[REG009]: Package version '${key}' already published and is immutable`,
            };
        }
        const digest = crypto.createHash("sha256").update(archiveBuf).digest("hex");
        const checksum = `sha256:${digest}`;
        meta.versions[version] = {
            version,
            checksum,
            dependencies: Object.fromEntries(Object.entries(manifest.dependencies || {}).map(([k, v]) => [
                (0, identity_js_1.normalizePackageName)(k),
                typeof v === "string" ? v : "*",
            ])),
            publishedAt: new Date().toISOString(),
            author: manifest.author,
        };
        meta.distTags["latest"] = version;
        this.archives.set(key, archiveBuf);
        return {
            ok: true,
            message: `Successfully published ${key}`,
        };
    }
    async searchPackages(query, limit = 20) {
        const q = query.toLowerCase();
        const results = [];
        for (const [name, meta] of this.packages.entries()) {
            if (name.includes(q) ||
                (meta.description && meta.description.toLowerCase().includes(q))) {
                const latestVer = meta.distTags["latest"] || Object.keys(meta.versions).pop() || "0.0.0";
                results.push({
                    name,
                    version: latestVer,
                    description: meta.description || "",
                });
            }
        }
        return results.slice(0, limit);
    }
    // Test helper: seed package directly
    seedPackage(manifest, archiveBuf) {
        this.publishPackage(manifest, archiveBuf);
    }
}
exports.MockRegistryClient = MockRegistryClient;
//# sourceMappingURL=registry-mock.js.map