"use strict";
/**
 * Vercel Platform Adapter (Experimental)
 *
 * Implements serverless bridge for Node.js based Vercel function routing.
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
exports.VercelAdapter = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class VercelAdapter {
    id = "vercel";
    name = "Vercel Serverless (Node Bridge)";
    tier = "EXPERIMENTAL";
    async detect(projectDir) {
        return fs.existsSync(path.join(projectDir, "vercel.json")) || fs.existsSync(path.join(projectDir, "api"));
    }
    async validate(_projectDir) {
        return {
            valid: true,
            warnings: ["Vercel integration is EXPERIMENTAL and relies on a Node.js serverless execution wrapper."],
            errors: [],
        };
    }
    async generateBundle(projectDir, _outDir) {
        const apiDir = path.join(projectDir, "api");
        fs.mkdirSync(apiDir, { recursive: true });
        const vercelJson = `{
  "version": 2,
  "builds": [
    {
      "src": "api/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/api/index.js"
    }
  ]
}
`;
        const vercelJsonPath = path.join(projectDir, "vercel.json");
        fs.writeFileSync(vercelJsonPath, vercelJson, "utf-8");
        const bridgeCode = `// HKD Vercel Serverless Bridge
const { spawn } = require("child_process");
const path = require("path");

module.exports = async (req, res) => {
  res.status(200).json({
    platform: "vercel",
    status: "experimental_bridge_active",
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  });
};
`;
        const bridgePath = path.join(apiDir, "index.js");
        fs.writeFileSync(bridgePath, bridgeCode, "utf-8");
        return [vercelJsonPath, bridgePath];
    }
}
exports.VercelAdapter = VercelAdapter;
//# sourceMappingURL=vercel.js.map