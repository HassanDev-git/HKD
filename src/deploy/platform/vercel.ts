/**
 * Vercel Platform Adapter (Experimental)
 *
 * Implements serverless bridge for Node.js based Vercel function routing.
 */

import * as fs from "fs";
import * as path from "path";
import { PlatformAdapter, PlatformValidation } from "./platform-manager.js";

export class VercelAdapter implements PlatformAdapter {
  public readonly id = "vercel";
  public readonly name = "Vercel Serverless (Node Bridge)";
  public readonly tier = "EXPERIMENTAL" as const;

  public async detect(projectDir: string): Promise<boolean> {
    return fs.existsSync(path.join(projectDir, "vercel.json")) || fs.existsSync(path.join(projectDir, "api"));
  }

  public async validate(_projectDir: string): Promise<PlatformValidation> {
    return {
      valid: true,
      warnings: ["Vercel integration is EXPERIMENTAL and relies on a Node.js serverless execution wrapper."],
      errors: [],
    };
  }

  public async generateBundle(projectDir: string, _outDir: string): Promise<string[]> {
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
