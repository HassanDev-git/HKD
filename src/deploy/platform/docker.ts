/**
 * Docker Platform Adapter
 */

import * as fs from "fs";
import * as path from "path";
import { PlatformAdapter, PlatformValidation } from "./platform-manager.js";
import { initContainer } from "../container.js";

export class DockerAdapter implements PlatformAdapter {
  public readonly id = "docker";
  public readonly name = "Docker / OCI Container";
  public readonly tier = "SUPPORTED" as const;

  public async detect(projectDir: string): Promise<boolean> {
    return fs.existsSync(path.join(projectDir, "Dockerfile"));
  }

  public async validate(projectDir: string): Promise<PlatformValidation> {
    const dockerfile = path.join(projectDir, "Dockerfile");
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!fs.existsSync(dockerfile)) {
      warnings.push("Dockerfile does not exist yet (can be generated with hkd container init)");
    } else {
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

  public async generateBundle(projectDir: string, _outDir: string): Promise<string[]> {
    const res = initContainer(projectDir);
    return [res.dockerfile, res.dockerignore];
  }
}
