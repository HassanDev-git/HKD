"use strict";
/**
 * Generic Linux Server Platform Adapter
 *
 * Generates systemd service units, deployment shell scripts, and health probes.
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
exports.GenericServerAdapter = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const index_js_1 = require("../../package-manager/index.js");
class GenericServerAdapter {
    id = "generic-server";
    name = "Generic Linux Server (systemd)";
    tier = "SUPPORTED";
    async detect(projectDir) {
        const manifest = (0, index_js_1.readManifest)(projectDir);
        return manifest?.deploy?.target === "server" || fs.existsSync(path.join(projectDir, "deploy.sh"));
    }
    async validate(projectDir) {
        const manifest = (0, index_js_1.readManifest)(projectDir);
        const errors = [];
        const warnings = [];
        if (!manifest) {
            errors.push("Missing hkd.toml manifest");
        }
        return {
            valid: errors.length === 0,
            warnings,
            errors,
        };
    }
    async generateBundle(projectDir, outDir) {
        fs.mkdirSync(outDir, { recursive: true });
        const manifest = (0, index_js_1.readManifest)(projectDir);
        const name = manifest?.name || "hkd-app";
        const port = manifest?.deploy?.port || 8080;
        // 1. Systemd service unit
        const serviceContent = `[Unit]
Description=${name} HKD Production Service
After=network.target

[Service]
Type=simple
User=hkd
Group=hkd
WorkingDirectory=/opt/${name}
ExecStart=/opt/${name}/${name}
Restart=always
RestartSec=5
LimitNOFILE=65536
Environment=HKD_ENV=production
Environment=PORT=${port}

[Install]
WantedBy=multi-user.target
`;
        const servicePath = path.join(outDir, `${name}.service`);
        fs.writeFileSync(servicePath, serviceContent, "utf-8");
        // 2. Deployment execution script
        const deployScript = `#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${name}"
INSTALL_DIR="/opt/\${APP_NAME}"

echo "Deploying \${APP_NAME} to \${INSTALL_DIR}..."
sudo mkdir -p "\${INSTALL_DIR}"
sudo cp "${name}" "\${INSTALL_DIR}/"
sudo cp "${name}.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart "\${APP_NAME}"
echo "Deployment successful."
`;
        const scriptPath = path.join(outDir, "deploy.sh");
        fs.writeFileSync(scriptPath, deployScript, "utf-8");
        return [servicePath, scriptPath];
    }
}
exports.GenericServerAdapter = GenericServerAdapter;
//# sourceMappingURL=generic-server.js.map