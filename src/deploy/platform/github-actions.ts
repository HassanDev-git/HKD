/**
 * GitHub Actions Platform Adapter
 */

import * as fs from "fs";
import * as path from "path";
import { PlatformAdapter, PlatformValidation } from "./platform-manager.js";

export class GithubActionsAdapter implements PlatformAdapter {
  public readonly id = "github-actions";
  public readonly name = "GitHub Actions CI/CD";
  public readonly tier = "SUPPORTED" as const;

  public async detect(projectDir: string): Promise<boolean> {
    return fs.existsSync(path.join(projectDir, ".github", "workflows"));
  }

  public async validate(projectDir: string): Promise<PlatformValidation> {
    const wfDir = path.join(projectDir, ".github", "workflows");
    const warnings: string[] = [];
    if (!fs.existsSync(wfDir)) {
      warnings.push("GitHub workflows directory not found");
    }
    return { valid: true, warnings, errors: [] };
  }

  public async generateBundle(projectDir: string, _outDir: string): Promise<string[]> {
    const wfDir = path.join(projectDir, ".github", "workflows");
    fs.mkdirSync(wfDir, { recursive: true });

    const ciContent = `name: HKD CI Pipeline

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    name: Test on \${{ matrix.os }}
    runs-on: \${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Build TypeScript
        run: npm run build
      - name: Run Test Suite
        run: npm test
      - name: HKD System Health
        run: node dist/cli/main.js doctor
`;
    const ciPath = path.join(wfDir, "ci.yml");
    fs.writeFileSync(ciPath, ciContent, "utf-8");

    const releaseContent = `name: HKD Production Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    name: Build & Package Release Artifacts
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install dependencies
        run: npm ci
      - name: Build Compiler
        run: npm run build
      - name: Build Release Bundle
        run: node dist/cli/main.js release --profile release --target x86_64-linux
      - name: Upload Release Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: hkd-release-x86_64-linux
          path: target/releases/
`;
    const releasePath = path.join(wfDir, "release.yml");
    fs.writeFileSync(releasePath, releaseContent, "utf-8");

    return [ciPath, releasePath];
  }
}
