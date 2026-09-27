"use strict";
/**
 * GitHub Actions Platform Adapter
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
exports.GithubActionsAdapter = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class GithubActionsAdapter {
    id = "github-actions";
    name = "GitHub Actions CI/CD";
    tier = "SUPPORTED";
    async detect(projectDir) {
        return fs.existsSync(path.join(projectDir, ".github", "workflows"));
    }
    async validate(projectDir) {
        const wfDir = path.join(projectDir, ".github", "workflows");
        const warnings = [];
        if (!fs.existsSync(wfDir)) {
            warnings.push("GitHub workflows directory not found");
        }
        return { valid: true, warnings, errors: [] };
    }
    async generateBundle(projectDir, _outDir) {
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
exports.GithubActionsAdapter = GithubActionsAdapter;
//# sourceMappingURL=github-actions.js.map