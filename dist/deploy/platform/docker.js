"use strict";
/**
 * Docker Platform Adapter
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
exports.DockerAdapter = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const container_js_1 = require("../container.js");
class DockerAdapter {
    id = "docker";
    name = "Docker / OCI Container";
    tier = "SUPPORTED";
    async detect(projectDir) {
        return fs.existsSync(path.join(projectDir, "Dockerfile"));
    }
    async validate(projectDir) {
        const dockerfile = path.join(projectDir, "Dockerfile");
        const errors = [];
        const warnings = [];
        if (!fs.existsSync(dockerfile)) {
            warnings.push("Dockerfile does not exist yet (can be generated with hkd container init)");
        }
        else {
            const content = fs.readFileSync(dockerfile, "utf-8");
            if (!content.includes("USER")) {
                warnings.push("Dockerfile does not specify a non-root USER");
            }
            if (!content.includes("HEALTHCHECK")) {
                warnings.push("Dockerfile lacks a HEALTHCHECK directive");
            }
        }
        return {
            valid: errors.length === 0,
            warnings,
            errors,
        };
    }
    async generateBundle(projectDir, _outDir) {
        const res = (0, container_js_1.initContainer)(projectDir);
        return [res.dockerfile, res.dockerignore];
    }
}
exports.DockerAdapter = DockerAdapter;
//# sourceMappingURL=docker.js.map