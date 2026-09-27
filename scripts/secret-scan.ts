/**
 * HKD Automated Secret & Sensitive Data Scanner
 * (scripts/secret-scan.ts)
 *
 * Scans repository files to detect:
 * - API keys, tokens, and private keys
 * - Hardcoded credentials
 * - Machine-specific local developer paths
 *
 * Exit code 0 if clean; exit code 1 if violations are found.
 */

import * as fs from "fs";
import * as path from "path";

interface SecretViolation {
  file: string;
  line: number;
  pattern: string;
  matchedText: string;
}

const SECRET_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "Private Key Header", regex: /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH)?\s*PRIVATE KEY-----/ },
  { name: "AWS Access Key ID", regex: /\b(AKIA[0-9A-Z]{16})\b/ },
  { name: "GitHub Personal Token", regex: /\b(ghp_[0-9a-zA-Z]{36})\b/ },
  { name: "Generic Secret Assignment", regex: /(?:api[_-]?key|secret[_-]?key|auth[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_\-]{20,}["']/i },
  { name: "Local Windows Path Leak", regex: /[A-Za-z]:\\Users\\[A-Za-z0-9_]+\\/ },
];

// Allowlisted filenames or substrings (e.g. tests validating masking or scanner itself)
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-release",
  "scratch",
  "target",
  ".hkd",
]);

const ALLOWLIST_MATCHES = [
  "scripts/secret-scan",
  "task.md",
  "walkthrough",
  "user_prompt",
  "transcript",
  "********", // masked tokens
  "fake",
  "dummy",
  "test_token",
];

export function runSecretScan(rootDir: string): SecretViolation[] {
  const violations: SecretViolation[] = [];

  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (IGNORED_DIRS.has(ent.name)) continue;

      const fullPath = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        scanDir(fullPath);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name);
        if ([".ts", ".js", ".hkd", ".json", ".md", ".toml", ".zig"].includes(ext)) {
          scanFile(fullPath, rootDir);
        }
      }
    }
  }

  function scanFile(filePath: string, baseDir: string) {
    const relPath = path.relative(baseDir, filePath).replace(/\\/g, "/");
    if (ALLOWLIST_MATCHES.some(m => relPath.includes(m))) {
      return;
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip lines with explicit allowlist comments
      if (line.includes("secret-scan:ignore")) continue;

      for (const { name, regex } of SECRET_PATTERNS) {
        const match = line.match(regex);
        if (match) {
          // Check if match is in allowlist
          const matchedStr = match[0];
          if (ALLOWLIST_MATCHES.some(m => matchedStr.includes(m))) continue;

          violations.push({
            file: relPath,
            line: i + 1,
            pattern: name,
            matchedText: matchedStr.slice(0, 30),
          });
        }
      }
    }
  }

  scanDir(rootDir);
  return violations;
}

// Standalone CLI execution
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").includes("secret-scan")) {
  const repoRoot = path.resolve(__dirname, "..");
  const violations = runSecretScan(repoRoot);

  if (violations.length === 0) {
    console.log("PASS: Secret & sensitive data scan clean. No leaked credentials or local paths found.");
    process.exit(0);
  } else {
    console.error(`FAIL: ${violations.length} potential secret violation(s) detected:`);
    for (const v of violations) {
      console.error(`  - ${v.file}:${v.line} [${v.pattern}]: ${v.matchedText}`);
    }
    process.exit(1);
  }
}
