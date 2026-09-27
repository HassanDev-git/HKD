"use strict";
/**
 * HKD Software Bill of Materials (SBOM) Generator
 *
 * Implements CycloneDX 1.5 JSON specification for supply-chain security,
 * listing application identity, dependencies, versions, and cryptographic hashes.
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
exports.generateCycloneDxSbom = generateCycloneDxSbom;
exports.writeSbomJson = writeSbomJson;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const index_js_1 = require("../package-manager/index.js");
const lockfile_js_1 = require("../package-manager/lockfile.js");
const index_js_2 = require("../utils/index.js");
function generateCycloneDxSbom(projectDir) {
    const manifest = (0, index_js_1.readManifest)(projectDir);
    const appName = manifest?.name || path.basename(projectDir);
    const appVersion = manifest?.version || "0.1.0";
    const components = [];
    // Add compiler & runtime components
    components.push({
        type: "framework",
        name: "hkd-compiler",
        version: index_js_2.HKD_VERSION,
        description: "HKD Programming Language Compiler & Toolchain",
        purl: `pkg:generic/hkd-compiler@${index_js_2.HKD_VERSION}`,
    });
    components.push({
        type: "framework",
        name: "hkd-runtime",
        version: index_js_2.HKD_VERSION,
        description: "HKD High-Performance Native Zig & Stack VM Runtime",
        purl: `pkg:generic/hkd-runtime@${index_js_2.HKD_VERSION}`,
    });
    // Read lockfile if present
    const lockPath = path.join(projectDir, "hkd.lock");
    if (fs.existsSync(lockPath)) {
        try {
            const lockContent = fs.readFileSync(lockPath, "utf-8");
            const lockData = (0, lockfile_js_1.parseLockfileV2)(lockContent);
            for (const pkgEntry of lockData.packages) {
                const hashes = [];
                if (pkgEntry.checksum) {
                    const cleanHash = pkgEntry.checksum.replace(/^sha256:/, "");
                    hashes.push({ alg: "SHA-256", content: cleanHash });
                }
                components.push({
                    type: "library",
                    name: pkgEntry.name,
                    version: pkgEntry.version,
                    description: `Resolved HKD dependency: ${pkgEntry.name}`,
                    hashes,
                    purl: `pkg:hkd/${pkgEntry.name}@${pkgEntry.version}`,
                });
            }
        }
        catch { }
    }
    const serialUuid = crypto.randomUUID();
    return {
        bomFormat: "CycloneDX",
        specVersion: "1.5",
        serialNumber: `urn:uuid:${serialUuid}`,
        version: 1,
        metadata: {
            timestamp: new Date().toISOString(),
            tools: [
                {
                    vendor: "HKD Language",
                    name: "hkd-sbom",
                    version: index_js_2.HKD_VERSION,
                },
            ],
            component: {
                type: "application",
                name: appName,
                version: appVersion,
                description: manifest?.description || "HKD Application",
                purl: `pkg:hkd/${appName}@${appVersion}`,
            },
        },
        components,
    };
}
function writeSbomJson(projectDir, outPath) {
    const sbom = generateCycloneDxSbom(projectDir);
    const dest = outPath || path.join(projectDir, "target", "sbom.json");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(sbom, null, 2), "utf-8");
    return dest;
}
//# sourceMappingURL=sbom.js.map