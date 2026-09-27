/**
 * Generic Linux Server Platform Adapter
 *
 * Generates systemd service units, deployment shell scripts, and health probes.
 */

import * as fs from "fs";
import * as path from "path";
import { PlatformAdapter, PlatformValidation } from "./platform-manager.js";
import { readManifest } from "../../package-manager/index.js";

export class GenericServerAdapter implements PlatformAdapter {
  public readonly id = "generic-server";
  public readonly name = "Generic Linux Server (systemd)";
  public readonly tier = "SUPPORTED" as const;

  public async detect(projectDir: string): Promise<boolean> {
    const manifest = readManifest(projectDir);
    return (manifest as any)?.deploy?.target === "server" || fs.existsSync(path.join(projectDir, "deploy.sh"));
  }

  public async validate(projectDir: string): Promise<PlatformValidation> {
    const manifest = readManifest(projectDir);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!manifest) {
      errors.push("Missing hkd.toml manifest");
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }

  public async generateBundle(projectDir: string, outDir: string): Promise<string[]> {
    fs.mkdirSync(outDir, { recursive: true });
    const manifest = readManifest(projectDir);
    const name = manifest?.name || "hkd-app";
    const port = (manifest as any)?.deploy?.port || 8080;

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
