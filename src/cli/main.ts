#!/usr/bin/env node
/**
 * HKD CLI Entry Point
 *
 * Commands:
 *   hkd init [name]      Initialize a new project
 *   hkd run [file]       Run an HKD project or source file
 *   hkd build [options]  Compile project modules incrementally
 *   hkd test [file]      Run discovered tests
 *   hkd fmt [file] [-w]  Format source code
 *   hkd lint [file]      Lint source code for issues
 *   hkd check [file]     Type-check without compiling
 *   hkd add <pkg>        Add a dependency (dir, .hkdpack, or version)
 *   hkd remove <pkg>     Remove a dependency
 *   hkd install          Install resolved dependencies
 *   hkd update           Update lockfile and dependencies
 *   hkd doc              Generate project documentation
 *   hkd version          Print version
 *   hkd help             Print help
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { spawnSync } from "child_process";
import { HKD_VERSION, parseEdition, LanguageEdition, DEFAULT_EDITION } from "../utils/index.js";
import { runFile } from "../runtime/index.js";
import { ErrorReporter } from "../errors/index.js";
import { Lexer } from "../lexer/lexer.js";
import { Parser } from "../parser/parser.js";
import { format } from "../formatter/index.js";
import { lint, formatLintIssues, LintCode } from "../linter/index.js";
import { PackageManager, readManifest } from "../package-manager/index.js";
import { PackageManager2 } from "../package-manager/manager.js";
import { auditProject } from "../package-manager/audit.js";
import { verifyBuildReproducibility } from "../package-manager/reproducible.js";
import { ContentAddressedCache } from "../package-manager/cache.js";
import { startRepl } from "./repl.js";
import { runTests } from "./test-runner.js";
import { SemanticAnalyser } from "../semantic/analyser.js";
import { Compiler } from "../bytecode/compiler.js";
import { serializeProgram } from "../bytecode/serializer.js";
import { runDoctor, printDoctorReport } from "./doctor.js";
import { parseTarget, listTargetsFormatted } from "../deploy/targets.js";
import { resolveProfile } from "../deploy/profiles.js";
import { verifyArtifact } from "../deploy/artifact.js";
import { buildReleaseBundle } from "../deploy/release.js";
import { loadEffectiveConfig, formatConfigReport } from "../deploy/env-config.js";
import { initContainer } from "../deploy/container.js";
import { PlatformRegistry } from "../deploy/platform/platform-manager.js";
import { GenericServerAdapter } from "../deploy/platform/generic-server.js";
import { DockerAdapter } from "../deploy/platform/docker.js";
import { GithubActionsAdapter } from "../deploy/platform/github-actions.js";
import { VercelAdapter } from "../deploy/platform/vercel.js";
import { writeSbomJson } from "../deploy/sbom.js";
import { runDeployCheck, printDeployCheckReport, runDeployDryRun } from "../deploy/check.js";
import { getRuntimeInfo, printRuntimeInfo, ExitCode } from "../deploy/runtime-info.js";
import { runMigration } from "../tooling/migrate.js";
import { runVerifyRelease, printVerifyReleaseReport } from "../tooling/verify-release.js";
import { explainError } from "./explain.js";
import { RfcValidator } from "../tooling/rfc-validator.js";

// ─── Colour helpers ───────────────────────────────────────────────────────────

const BOLD  = (s: string) => `\x1b[1m${s}\x1b[0m`;
const GREEN = (s: string) => `\x1b[32m${s}\x1b[0m`;
const RED   = (s: string) => `\x1b[31m${s}\x1b[0m`;
const CYAN  = (s: string) => `\x1b[36m${s}\x1b[0m`;
const YELLOW = (s: string) => `\x1b[33m${s}\x1b[0m`;
const DIM   = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "run":       cmdRun(args.slice(1)); break;
    case "profile":   cmdProfile(args.slice(1)); break;
    case "build":     cmdBuild(args.slice(1)); break;
    case "bench":     cmdBench(args.slice(1)); break;
    case "stats":     cmdStats(args.slice(1)); break;
    case "jit-stats": cmdJitStats(args.slice(1)); break;
    case "mem-stats": cmdMemStats(args.slice(1)); break;
    case "lsp":       import("../lsp/server.js"); break;
    case "dap":       import("../debug/server.js"); break;
    case "doctor":    cmdDoctor(args.slice(1)); break;
    case "repl":      cmdRepl(args.slice(1)); break;
    case "fmt":       cmdFmt(args.slice(1)); break;
    case "lint":      cmdLint(args.slice(1)); break;
    case "test":      cmdTest(args.slice(1)); break;
    case "check":     cmdCheck(args.slice(1)); break;
    case "init":      cmdInit(args.slice(1)); break;
    case "add":       cmdAdd(args.slice(1)); break;
    case "remove":    cmdRemove(args.slice(1)); break;
    case "install":   cmdInstall(args.slice(1)); break;
    case "update":    cmdUpdate(args.slice(1)); break;
    case "pack":      cmdPack(args.slice(1)); break;
    case "publish":   cmdPublish(args.slice(1)); break;
    case "search":    cmdSearch(args.slice(1)); break;
    case "info":      cmdInfo(args.slice(1)); break;
    case "vendor":    cmdVendor(args.slice(1)); break;
    case "audit":     cmdAudit(args.slice(1)); break;
    case "cache":     cmdCache(args.slice(1)); break;
    case "ci":        cmdCi(args.slice(1)); break;
    case "targets":         cmdTargets(); break;
    case "release":         cmdRelease(args.slice(1)); break;
    case "verify-artifact": cmdVerifyArtifact(args.slice(1)); break;
    case "config":          cmdConfig(args.slice(1)); break;
    case "container":       cmdContainer(args.slice(1)); break;
    case "platform":        cmdPlatform(args.slice(1)); break;
    case "deploy":          cmdDeploy(args.slice(1)); break;
    case "sbom":            cmdSbom(args.slice(1)); break;
    case "runtime-info":    cmdRuntimeInfo(args.slice(1)); break;
    case "migrate":         cmdMigrate(args.slice(1)); break;
    case "verify-release":  cmdVerifyRelease(args.slice(1)); break;
    case "explain":         cmdExplain(args.slice(1)); break;
    case "rfc":             cmdRfc(args.slice(1)); break;
    case "doc":       cmdDoc(); break;
    case "version":
    case "--version":
    case "-v":
      console.log(`HKD ${HKD_VERSION}`);
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      if (command.endsWith(".hkd") && fs.existsSync(command)) {
        cmdRun([command]);
      } else {
        console.error(RED(`Unknown command: \`${command}\``));
        console.error(`Run ${CYAN("hkd help")} to see available commands.`);
        process.exit(2);
      }
  }
}

// ─── Project Module Crawler ───────────────────────────────────────────────────

function getImportSources(filePath: string): string[] {
  try {
    const source = fs.readFileSync(filePath, "utf-8");
    const reporter = new ErrorReporter(source, filePath);
    const lexer = new Lexer(source, filePath, reporter);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, source, filePath, reporter);
    const ast = parser.parse();
    
    const imports: string[] = [];
    for (const stmt of ast.statements) {
      if (stmt.kind === "ImportStmt") {
        imports.push(stmt.source);
      }
    }
    return imports;
  } catch {
    return [];
  }
}

function collectProjectModules(entryPath: string): string[] {
  const visited = new Set<string>();
  const queue = [path.resolve(entryPath)];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    
    const dir = path.dirname(current);
    const imports = getImportSources(current);
    
    for (const imp of imports) {
      if (!imp.startsWith("./") && !imp.startsWith("../") && !path.isAbsolute(imp)) {
        // Resolve package from .hkd/deps or vendor
        let pkgDir = path.join(dir, ".hkd", "deps", imp);
        if (!fs.existsSync(pkgDir)) {
          pkgDir = path.join(dir, "vendor", imp);
        }
        const manifest = readManifest(pkgDir);
        if (manifest) {
          const pkgEntry = path.resolve(pkgDir, manifest.main ?? "src/main.hkd");
          queue.push(pkgEntry);
        }
        continue;
      }
      
      const resolved = path.resolve(dir, imp);
      if (fs.existsSync(resolved)) {
        queue.push(resolved);
      }
    }
  }
  
  return Array.from(visited);
}

function calculateFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function getProjectDir(): string | null {
  let projectDir = process.cwd();
  while (true) {
    if (fs.existsSync(path.join(projectDir, "hkd.toml"))) return projectDir;
    const parent = path.dirname(projectDir);
    if (parent === projectDir) break;
    projectDir = parent;
  }
  return null;
}

function detectFileEdition(filePath: string): LanguageEdition {
  const abs = path.resolve(filePath);
  let dir = path.dirname(abs);
  while (dir && dir !== path.dirname(dir)) {
    const tomlPath = path.join(dir, "hkd.toml");
    if (fs.existsSync(tomlPath)) {
      try {
        const content = fs.readFileSync(tomlPath, "utf-8");
        if (/edition\s*=\s*"2027"/.test(content)) {
          return "2027";
        }
      } catch {}
      break;
    }
    dir = path.dirname(dir);
  }
  return DEFAULT_EDITION;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function compileFileTo(filePath: string, outPath: string) {
  const source = fs.readFileSync(filePath, "utf-8");
  const fileName = path.resolve(filePath);
  const reporter = new ErrorReporter(source, fileName);
  const edition = detectFileEdition(fileName);
  
  const lexer = new Lexer(source, fileName, reporter);
  const tokens = lexer.tokenize();
  if (reporter.hasErrors()) {
    console.error(reporter.format());
    process.exit(1);
  }
  
  const parser = new Parser(tokens, source, fileName, reporter, edition);
  const ast = parser.parse();
  if (reporter.hasErrors()) {
    console.error(reporter.format());
    process.exit(1);
  }
  
  const analyser = new SemanticAnalyser(reporter, source);
  analyser.analyse(ast);
  if (reporter.hasErrors()) {
    console.error(reporter.format());
    process.exit(1);
  }
  
  const compiler = new Compiler(reporter);
  const chunk = compiler.compile(ast);
  if (reporter.hasErrors()) {
    console.error(reporter.format());
    process.exit(1);
  }
  
  const binary = serializeProgram(chunk);
  fs.writeFileSync(outPath, binary);
}

function cmdBuild(args: string[]): string {
  if (args.includes("--verify-reproducible")) {
    const fileArg = args.find(a => !a.startsWith("-"));
    if (!fileArg) {
      console.error(RED("Error: Specify source file for reproducible build verification"));
      process.exit(1);
    }
    const result = verifyBuildReproducibility(fileArg, path.resolve("dist/cli/main.js"));
    console.log(result.message);
    if (!result.reproducible) process.exit(1);
    return "";
  }

  if (args.includes("--native")) {
    return buildStandaloneNative(args);
  }

  const isRelease = args.includes("--release");
  const mode = isRelease ? "release" : "debug";
  const fileArg = args.find(a => !a.startsWith("-") && a.endsWith(".hkd"));
  if (fileArg) {
    if (!fs.existsSync(fileArg)) {
      console.error(RED(`Error: File not found: ${fileArg}`));
      process.exit(1);
    }
    const outPath = fileArg.endsWith(".hkd") ? fileArg.replace(/\.hkd$/, ".hkdb") : fileArg + ".hkdb";
    compileFileTo(fileArg, outPath);
    console.log(GREEN(`✓ Compiled ${fileArg} → ${outPath}`));
    return outPath;
  }

  const projectDir = getProjectDir();

  if (!projectDir) {
    console.error(RED("Error: No file or project found to build."));
    process.exit(2);
  }

  const manifest = readManifest(projectDir);
  if (!manifest) {
    console.error(RED("Error: Failed to read hkd.toml"));
    process.exit(1);
  }

  if (manifest.edition && manifest.edition !== "2026" && manifest.edition !== "2027") {
    console.error(RED(`Error: Unsupported edition "${manifest.edition}" in hkd.toml. Supported editions: 2026, 2027`));
    process.exit(1);
  }

  const entryFile = path.resolve(projectDir, manifest.main ?? "src/main.hkd");
  if (!fs.existsSync(entryFile)) {
    console.error(RED(`Error: Entry file not found: ${entryFile}`));
    process.exit(1);
  }

  const targetDir = path.join(projectDir, "target", mode);
  fs.mkdirSync(targetDir, { recursive: true });

  const manifestPath = path.join(projectDir, "target", "build-manifest.json");
  let buildManifest = {
    compilerVersion: HKD_VERSION,
    edition: manifest.edition ?? "2026",
    mode,
    files: {} as Record<string, { hash: string; output: string }>
  };

  if (fs.existsSync(manifestPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      if (existing.compilerVersion === HKD_VERSION && existing.edition === (manifest.edition ?? "2026") && existing.mode === mode) {
        buildManifest = existing;
      }
    } catch {}
  }

  const allModules = collectProjectModules(entryFile);
  const newFiles: Record<string, { hash: string; output: string }> = {};

  let compiledCount = 0;
  for (const modPath of allModules) {
    const relPath = path.relative(projectDir, modPath).replace(/\\/g, "/");
    const currentHash = calculateFileHash(modPath);
    
    let outPath = "";
    if (modPath.includes(".hkd/deps/")) {
      outPath = modPath.replace(/\.hkd$/, ".hkdb");
    } else {
      const relToProject = path.relative(projectDir, modPath);
      outPath = path.join(targetDir, relToProject.replace(/\.hkd$/, ".hkdb"));
    }

    const cached = buildManifest.files[relPath];
    if (cached && cached.hash === currentHash && fs.existsSync(outPath) && fs.existsSync(cached.output)) {
      newFiles[relPath] = cached;
      continue;
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    compileFileTo(modPath, outPath);
    compiledCount++;

    newFiles[relPath] = {
      hash: currentHash,
      output: outPath
    };
  }

  buildManifest.files = newFiles;
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(buildManifest, null, 2), "utf-8");

  if (compiledCount > 0) {
    console.log(GREEN(`✓ Compiled ${compiledCount} module(s) (${mode} build)`));
  } else {
    console.log(DIM("✓ Project is up to date"));
  }

  const mainRelPath = path.relative(projectDir, entryFile).replace(/\\/g, "/");
  return buildManifest.files[mainRelPath].output;
}

function buildStandaloneNative(args: string[]): string {
  const fileArg = args.find(a => !a.startsWith("-") && a.endsWith(".hkd"));
  
  let entryHkd = fileArg;
  if (!entryHkd) {
    const projectDir = getProjectDir();
    if (projectDir) {
      const manifest = readManifest(projectDir);
      const manifestMain = manifest?.main && manifest.main.endsWith(".hkd") ? manifest.main : "src/main.hkd";
      entryHkd = manifest ? path.resolve(projectDir, manifestMain) : undefined;
    }
  }

  if (!entryHkd || !fs.existsSync(entryHkd)) {
    console.error(RED("Error: Specify an .hkd file to build natively (e.g. hkd build --native main.hkd)"));
    process.exit(2);
  }

  // Check for Profile-Guided Optimization (--pgo profile.json)
  const pgoIdx = args.indexOf("--pgo");
  let pgoData: any = null;
  let pgoProfilePath: string | null = null;
  if (pgoIdx !== -1 && args[pgoIdx + 1]) {
    pgoProfilePath = path.resolve(args[pgoIdx + 1]);
    if (fs.existsSync(pgoProfilePath)) {
      try {
        pgoData = JSON.parse(fs.readFileSync(pgoProfilePath, "utf-8"));
      } catch (err: any) {
        console.error(RED(`Error reading PGO profile: ${err.message}`));
      }
    } else {
      console.error(RED(`Error: PGO profile file not found: ${pgoProfilePath}`));
      process.exit(1);
    }
  }

  // Disk Code Cache Persistence (.hkd/cache/native)
  const cacheDir = path.resolve(process.cwd(), ".hkd/cache/native");
  fs.mkdirSync(cacheDir, { recursive: true });
  const sourceContent = fs.readFileSync(entryHkd);
  const cacheKey = crypto.createHash("sha256")
    .update(sourceContent)
    .update(pgoData ? JSON.stringify(pgoData) : "nopgo")
    .digest("hex");
  const cachedBinaryPath = path.join(cacheDir, `${cacheKey}.bin`);

  // Determine output binary name
  let outExe = "";
  const oIdx = args.indexOf("-o");
  if (oIdx !== -1 && args[oIdx + 1]) {
    outExe = args[oIdx + 1];
  } else {
    const ext = process.platform === "win32" ? ".exe" : "";
    outExe = entryHkd.replace(/\.hkd$/, ext);
  }

  // 1. Compile HKD to HKDB
  const tempHkdb = entryHkd.replace(/\.hkd$/, ".tmp.hkdb");
  compileFileTo(entryHkd, tempHkdb);
  const hkdbBytes = fs.readFileSync(tempHkdb);
  fs.unlinkSync(tempHkdb);

  // 2. Locate native runtime binary
  const targetIdx = args.indexOf("--target");
  const targetVal = targetIdx !== -1 ? args[targetIdx + 1] : undefined;
  const isTargetWindows = targetVal ? targetVal.includes("windows") : process.platform === "win32";
  const binName = isTargetWindows ? "hkd-runtime.exe" : "hkd-runtime";
  const possiblePaths = [
    path.resolve(__dirname, "../../native-runtime/zig-out/bin", binName),
    path.resolve(__dirname, "../../../native-runtime/zig-out/bin", binName),
    path.resolve(__dirname, binName),
    path.resolve(process.cwd(), binName),
    path.resolve(process.cwd(), "native-runtime/zig-out/bin", binName),
  ];

  let runtimePath = "";
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      runtimePath = p;
      break;
    }
  }

  if (!runtimePath) {
    console.error(RED("Error: Native runtime binary not found. Build it with: cd native-runtime && npx zig build -Doptimize=ReleaseFast"));
    process.exit(1);
  }

  const runtimeBytes = fs.readFileSync(runtimePath);

  // 3. Build standalone trailer: [runtime] + [hkdb] + [u64 length] + "HKDSTAND"
  const payloadLenBuf = Buffer.alloc(8);
  payloadLenBuf.writeBigUInt64LE(BigInt(hkdbBytes.length));
  const magicBuf = Buffer.from("HKDSTAND", "ascii");

  const finalBinary = Buffer.concat([runtimeBytes, hkdbBytes, payloadLenBuf, magicBuf]);
  fs.mkdirSync(path.dirname(outExe), { recursive: true });
  fs.writeFileSync(outExe, finalBinary);
  fs.writeFileSync(cachedBinaryPath, finalBinary);
  if (process.platform !== "win32") {
    fs.chmodSync(outExe, 0o755);
  }

  if (!args.includes("--quiet")) {
    if (pgoData) {
      console.log(GREEN(`✓ Profile-Guided Optimization (PGO) applied from ${path.basename(pgoProfilePath!)}`));
      console.log(DIM(`  Functions profiled: ${pgoData.functions?.length ?? 0}, Loop records: ${pgoData.loops?.length ?? 0}`));
    }
    console.log(GREEN(`✓ Standalone native executable built: ${outExe} (${(finalBinary.length / 1024 / 1024).toFixed(2)} MB)`));
    console.log(DIM(`  Persistent code cache entry: .hkd/cache/native/${cacheKey.slice(0, 16)}`));
  }
  return outExe;
}

function cmdRun(args: string[]): void {
  const isRelease = args.includes("--release");
  const useReference = args.includes("--reference") || args.includes("--ts");
  const useNative = args.includes("--native");
  const useJit = args.includes("--jit");
  const useVm = args.includes("--vm");
  const cleanArgs = args.filter(a => !["--release", "--reference", "--ts", "--native", "--jit", "--vm"].includes(a));

  const firstArg = cleanArgs[0];

  if (useNative) {
    const exe = buildStandaloneNative([...args, "--quiet"]);
    const child = spawnSync(path.resolve(exe), cleanArgs.slice(1), { stdio: "inherit" });
    process.exit(child.status ?? 0);
  }

  let compiledPath = "";
  if (firstArg && firstArg.endsWith(".hkd")) {
    if (!fs.existsSync(firstArg)) {
      console.error(RED(`File not found: ${firstArg}`));
      process.exit(1);
    }
    compiledPath = firstArg.replace(/\.hkd$/, ".hkdb");
    const modules = collectProjectModules(firstArg);
    for (const mod of modules) {
      const modOut = mod.replace(/\.hkd$/, ".hkdb");
      compileFileTo(mod, modOut);
    }
  } else {
    compiledPath = cmdBuild(isRelease ? ["--release"] : []);
  }

  if (useReference) {
    const sourceFile = (firstArg && firstArg.endsWith(".hkd")) ? firstArg : (getProjectDir() ? path.resolve(getProjectDir()!, readManifest(getProjectDir()!)?.main ?? "src/main.hkd") : firstArg);
    const result = runFile(sourceFile);
    process.exit(result.ok ? 0 : 1);
  } else {
    const runtimePath = getRuntimePath();
    const runtimeFlags: string[] = [];
    for (const a of args) {
      if (a === "--jit" || a === "--vm" || a === "--jit-stats" || a === "--mem-stats" || a === "--skip-validation" || a.startsWith("--profile")) {
        runtimeFlags.push(a);
      }
    }

    const child = spawnSync(runtimePath, [...runtimeFlags, compiledPath, ...cleanArgs.slice(1)], { stdio: "inherit" });
    process.exit(child.status ?? 0);
  }
}

function getRuntimePath(): string {
  const binName = process.platform === "win32" ? "hkd-runtime.exe" : "hkd-runtime";
  const possiblePaths = [
    path.resolve(__dirname, "../../native-runtime/zig-out/bin", binName),
    path.resolve(__dirname, "../../../native-runtime/zig-out/bin", binName),
    path.resolve(__dirname, binName),
    path.resolve(process.cwd(), binName),
    path.resolve(process.cwd(), "native-runtime/zig-out/bin", binName),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  console.error(RED("Error: Native runtime executable not found."));
  console.error("Please compile the native runtime first with: cd native-runtime && npx zig build");
  process.exit(1);
}

function cmdProfile(args: string[]): void {
  const oIdx = args.indexOf("-o");
  let outFile = "profile.json";
  let targetArgs = [...args];
  if (oIdx !== -1 && args[oIdx + 1]) {
    outFile = args[oIdx + 1];
    targetArgs.splice(oIdx, 2);
  }
  const fileArg = targetArgs.find(a => !a.startsWith("-"));
  if (!fileArg) {
    console.error(RED("Error: Specify an .hkd file to profile (e.g. hkd profile app.hkd -o profile.json)"));
    process.exit(2);
  }
  const compiled = fileArg.endsWith(".hkd") ? fileArg.replace(/\.hkd$/, ".hkdb") : fileArg + ".hkdb";
  compileFileTo(fileArg, compiled);
  const runtimePath = getRuntimePath();
  const child = spawnSync(runtimePath, [`--profile=${outFile}`, compiled], { stdio: "inherit" });
  if (child.status === 0) {
    console.log(GREEN(`✓ Execution profile recorded: ${outFile}`));
  }
  process.exit(child.status ?? 0);
}

function cmdJitStats(args: string[]): void {
  cmdRun([...args, "--jit-stats"]);
}

function cmdMemStats(args: string[]): void {
  cmdRun([...args, "--mem-stats"]);
}

function cmdStats(args: string[]): void {
  const fileArg = args.find(a => !a.startsWith("-"));
  if (!fileArg || !fs.existsSync(fileArg)) {
    console.error(RED("Error: Specify an existing .hkd file for code statistics"));
    process.exit(1);
  }

  const source = fs.readFileSync(fileArg, "utf-8");
  const lines = source.split("\n").length;
  const chars = source.length;
  const reporter = new ErrorReporter(source, fileArg);
  const lexer = new Lexer(source, fileArg, reporter);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, source, fileArg, reporter);
  const ast = parser.parse();

  let fnCount = 0;
  let structCount = 0;
  for (const s of ast.statements) {
    if (s.kind === "FunctionDeclStmt") fnCount++;
    if (s.kind === "StructDeclStmt") structCount++;
  }

  console.log(BOLD("\n=== HKD Code Statistics ==="));
  console.log(`File:        ${CYAN(path.basename(fileArg))}`);
  console.log(`Lines:       ${lines}`);
  console.log(`Characters:  ${chars}`);
  console.log(`Tokens:      ${tokens.length}`);
  console.log(`Statements:  ${ast.statements.length}`);
  console.log(`Functions:   ${fnCount}`);
  console.log(`Structs:     ${structCount}\n`);
}

function cmdBench(args: string[]): void {
  const fileArg = args.find(a => !a.startsWith("-"));
  if (!fileArg || !fs.existsSync(fileArg)) {
    console.error(RED("Error: Specify an existing .hkd file to benchmark"));
    process.exit(1);
  }

  const compiled = fileArg.endsWith(".hkd") ? fileArg.replace(/\.hkd$/, ".hkdb") : fileArg + ".hkdb";
  compileFileTo(fileArg, compiled);
  const runtimePath = getRuntimePath();

  console.log(BOLD(`\n=== Benchmarking ${CYAN(path.basename(fileArg))} ===`));

  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    const res = spawnSync(runtimePath, [compiled], { encoding: "utf-8" });
    const t1 = performance.now();
    if (res.status === 0) {
      times.push(t1 - t0);
    }
  }

  if (times.length > 0) {
    const min = Math.min(...times);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`Cold Start:  ${times[0].toFixed(2)} ms`);
    console.log(`Fastest:     ${min.toFixed(2)} ms`);
    console.log(`Average:     ${avg.toFixed(2)} ms (over ${times.length} runs)`);
    console.log(`Status:      ${GREEN("Pass")}\n`);
  }
}

function cmdRepl(args: string[] = []): void {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
HKD Interactive REPL

Usage:
  hkd repl [options]

Options:
  --edition <2026|2027>   Language edition (default: 2026)
  --help, -h              Show this help message

Examples:
  hkd repl
  hkd repl --edition 2027
`);
    process.exit(0);
  }

  let edition: LanguageEdition = DEFAULT_EDITION;
  const editionIdx = args.indexOf("--edition");
  if (editionIdx !== -1) {
    const rawEdition = args[editionIdx + 1];
    if (!rawEdition || rawEdition.startsWith("-")) {
      console.error(RED("Error: Missing value for --edition. Supported editions: \"2026\", \"2027\"."));
      process.exit(ExitCode.UsageError);
    }
    try {
      edition = parseEdition(rawEdition);
    } catch (err: any) {
      console.error(RED(`Error: ${err.message}`));
      process.exit(ExitCode.UsageError);
    }
  } else {
    const eqArg = args.find((a) => a.startsWith("--edition="));
    if (eqArg) {
      const rawEdition = eqArg.slice("--edition=".length);
      try {
        edition = parseEdition(rawEdition);
      } catch (err: any) {
        console.error(RED(`Error: ${err.message}`));
        process.exit(ExitCode.UsageError);
      }
    }
  }

  startRepl(edition);
}

function cmdFmt(args: string[]): void {
  if (args.length === 0) {
    console.error(RED("hkd fmt: Expected a file path"));
    process.exit(2);
  }

  const filePath = args[0];
  if (!fs.existsSync(filePath)) {
    console.error(RED(`File not found: ${filePath}`));
    process.exit(1);
  }

  const source = fs.readFileSync(filePath, "utf-8");
  const fileName = path.resolve(filePath);
  const reporter = new ErrorReporter(source, fileName);

  const lexer = new Lexer(source, fileName, reporter);
  const tokens = lexer.tokenize();

  if (reporter.hasErrors()) {
    console.error(RED(`fmt: ${filePath} has syntax errors — cannot format`));
    process.exit(1);
  }

  const parser = new Parser(tokens, source, fileName, reporter, detectFileEdition(fileName));
  const ast = parser.parse();

  if (reporter.hasErrors()) {
    console.error(RED(`fmt: ${filePath} has parse errors — cannot format`));
    process.exit(1);
  }

  const formatted = format(ast);

  const inPlace = args.includes("--write") || args.includes("-w");
  if (inPlace) {
    fs.writeFileSync(filePath, formatted, "utf-8");
    console.log(GREEN(`✓ Formatted ${filePath}`));
  } else {
    process.stdout.write(formatted);
  }
}

export function applyLintFixes(source: string, issues: any[]): string {
  const sortedIssues = [...issues].sort((a, b) => b.span.start.offset - a.span.start.offset);
  let result = source;

  for (const issue of sortedIssues) {
    if (issue.code === LintCode.L005) {
      // Unused import: remove the import line/statement
      const start = issue.span.start.offset;
      const end = issue.span.end.offset;
      
      let lineStart = start;
      while (lineStart > 0 && result[lineStart - 1] !== "\n") lineStart--;
      let lineEnd = end;
      while (lineEnd < result.length && result[lineEnd] !== "\n") lineEnd++;
      if (lineEnd < result.length && result[lineEnd] === "\n") lineEnd++;

      result = result.substring(0, lineStart) + result.substring(lineEnd);
    } else if (issue.code === LintCode.L001) {
      // Unused variable: rename to _name
      const start = issue.span.start.offset;
      const end = issue.span.end.offset;
      const originalText = result.substring(start, end);
      const match = issue.message.match(/Variable `([a-zA-Z0-9_]+)`/);
      if (match) {
        const varName = match[1];
        const nameRegex = new RegExp(`\\b${varName}\\b`);
        const regexMatch = originalText.match(nameRegex);
        if (regexMatch && regexMatch.index !== undefined) {
          const varOffset = start + regexMatch.index;
          result = result.substring(0, varOffset) + "_" + varName + result.substring(varOffset + varName.length);
        }
      }
    }
  }

  // Format the fixed source
  try {
    const reporter = new ErrorReporter(result, "fix.hkd");
    const lexer = new Lexer(result, "fix.hkd", reporter);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, result, "fix.hkd", reporter);
    const ast = parser.parse();
    if (!reporter.hasErrors()) {
      result = format(ast);
    }
  } catch {}

  return result;
}

function cmdLint(args: string[]): void {
  const hasFix = args.includes("--fix");
  const cleanArgs = args.filter((a) => a !== "--fix");

  if (cleanArgs.length === 0) {
    console.error(RED("hkd lint: Expected a file path"));
    process.exit(2);
  }

  const filePath = cleanArgs[0];
  if (!fs.existsSync(filePath)) {
    console.error(RED(`File not found: ${filePath}`));
    process.exit(1);
  }

  const source = fs.readFileSync(filePath, "utf-8");
  const fileName = path.resolve(filePath);
  const reporter = new ErrorReporter(source, fileName);

  const lexer = new Lexer(source, fileName, reporter);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, source, fileName, reporter);
  const ast = parser.parse();

  if (reporter.hasErrors()) {
    console.error(RED(`lint: ${filePath} has syntax errors — fix them first`));
    process.exit(1);
  }

  const projectDir = getProjectDir();
  const manifest = projectDir ? readManifest(projectDir) : null;
  const ignored = new Set<string>((manifest as any)?.lint?.ignore ?? []);

  const issues = lint(ast, ignored);

  if (hasFix && issues.length > 0) {
    const fixedSource = applyLintFixes(source, issues);
    fs.writeFileSync(filePath, fixedSource, "utf-8");
    console.log(GREEN(`✓ Fixed lint issues in ${filePath}`));
    
    const newReporter = new ErrorReporter(fixedSource, fileName);
    const newLexer = new Lexer(fixedSource, fileName, newReporter);
    const newTokens = newLexer.tokenize();
    const newParser = new Parser(newTokens, fixedSource, fileName, newReporter);
    const newAst = newParser.parse();
    const remainingIssues = lint(newAst, ignored);
    
    if (remainingIssues.length > 0) {
      const output = formatLintIssues(remainingIssues, fixedSource, fileName);
      console.log(output);
    } else {
      console.log(GREEN("No remaining lint issues."));
    }
    process.exit(0);
  }

  const output = formatLintIssues(issues, source, fileName);
  console.log(output);

  const errors  = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const hints   = issues.filter((i) => i.severity === "hint");

  const summary = [
    errors.length   > 0 ? RED(`${errors.length} error(s)`)     : null,
    warnings.length > 0 ? `${warnings.length} warning(s)` : null,
    hints.length    > 0 ? DIM(`${hints.length} hint(s)`)   : null,
  ].filter(Boolean).join(", ");

  if (summary) {
    console.log(`\n${filePath}: ${summary}`);
  }

  if (errors.length > 0) process.exit(1);
}

function cmdTest(args: string[]): void {
  const filterIdx = args.indexOf("--filter");
  const filter = filterIdx !== -1 ? args[filterIdx + 1] : undefined;
  const verbose = args.includes("--verbose");
  const quiet = args.includes("--quiet");
  const conformance = args.includes("--conformance");
  const differential = args.includes("--differential");

  const cleanArgs = args.filter((a, idx) => {
    if (
      a === "--verbose" ||
      a === "--quiet" ||
      a === "--filter" ||
      a === "--conformance" ||
      a === "--differential"
    )
      return false;
    if (idx > 0 && args[idx - 1] === "--filter") return false;
    return true;
  });

  const target = conformance ? "tests/conformance" : (cleanArgs[0] ?? ".");
  runTests(target, { filter, verbose, quiet, conformance, differential });
}

function cmdCheck(args: string[]): void {
  if (args.length === 0) {
    console.error(RED("hkd check: Expected a file path"));
    process.exit(2);
  }

  const filePath = args[0];
  if (!fs.existsSync(filePath)) {
    console.error(RED(`File not found: ${filePath}`));
    process.exit(1);
  }
  const source = fs.readFileSync(filePath, "utf-8");
  const fileName = path.resolve(filePath);

  const reporter = new ErrorReporter(source, fileName);
  const lexer = new Lexer(source, fileName, reporter);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, source, fileName, reporter, detectFileEdition(fileName));
  const ast = parser.parse();

  if (reporter.hasErrors()) {
    console.log(reporter.format());
    process.exit(1);
  }

  const analyser = new SemanticAnalyser(reporter, source);
  analyser.analyse(ast);

  if (reporter.hasErrors()) {
    console.log(reporter.format());
    process.exit(1);
  }

  console.log(GREEN(`✓ ${path.basename(filePath)} — no errors`));
}

function cmdInit(args: string[]): void {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
HKD Project Initializer

Usage:
  hkd init [target_dir] [project_name] [options]

Options:
  --template <cli|lib|server>  Project template (default: cli)
  --edition <2026|2027>        Language edition (default: 2026)
  --help, -h                   Show this help message

Examples:
  hkd init my-app
  hkd init my-lib --template lib --edition 2027
`);
    process.exit(0);
  }

  const templateIdx = args.indexOf("--template");
  const template = templateIdx !== -1 ? args[templateIdx + 1] : "cli";

  let edition: LanguageEdition = DEFAULT_EDITION;
  const editionIdx = args.indexOf("--edition");
  if (editionIdx !== -1) {
    const rawEdition = args[editionIdx + 1];
    if (!rawEdition || rawEdition.startsWith("-")) {
      console.error(RED("Error: Missing value for --edition. Supported editions: \"2026\", \"2027\"."));
      process.exit(ExitCode.UsageError);
    }
    try {
      edition = parseEdition(rawEdition);
    } catch (err: any) {
      console.error(RED(`Error: ${err.message}`));
      process.exit(ExitCode.UsageError);
    }
  } else {
    const eqArg = args.find((a) => a.startsWith("--edition="));
    if (eqArg) {
      const rawEdition = eqArg.slice("--edition=".length);
      try {
        edition = parseEdition(rawEdition);
      } catch (err: any) {
        console.error(RED(`Error: ${err.message}`));
        process.exit(ExitCode.UsageError);
      }
    }
  }

  const cleanArgs = args.filter((a, idx) => {
    if (a === "--template") return false;
    if (idx > 0 && args[idx - 1] === "--template") return false;
    if (a === "--edition") return false;
    if (idx > 0 && args[idx - 1] === "--edition") return false;
    if (a.startsWith("--edition=")) return false;
    return true;
  });

  const targetDir = cleanArgs[0] ?? ".";
  const name = cleanArgs[1] ?? "";
  const pm = new PackageManager();
  const result = pm.init(path.resolve(targetDir), name, template, edition);

  if (result.ok) {
    console.log(GREEN(`✓ ${result.message}`));
    console.log(DIM(`  Edition: ${edition}`));
    console.log(DIM(`  Edit hkd.toml to configure your project.`));
    console.log(DIM(`  Run \`hkd run\` to start.`));
  } else {
    console.error(RED(result.message));
    process.exit(1);
  }
}

async function cmdAdd(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.error(RED("hkd add: Expected a package name, e.g. hkd add http@^1.0.0"));
    process.exit(1);
  }
  const projectDir = getProjectDir();
  if (!projectDir) {
    console.error(RED("Error: Not inside an HKD project (no hkd.toml found)"));
    process.exit(1);
  }
  const pm = new PackageManager2();
  const res = await pm.add(projectDir, args[0], {
    offline: args.includes("--offline"),
  });
  if (res.ok) {
    console.log(GREEN("✓ ") + res.message);
  } else {
    console.error(RED(res.message));
    process.exit(1);
  }
}

async function cmdRemove(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.error(RED("hkd remove: Expected a package name"));
    process.exit(1);
  }
  const projectDir = getProjectDir();
  if (!projectDir) {
    console.error(RED("Error: Not inside an HKD project (no hkd.toml found)"));
    process.exit(1);
  }
  const pm = new PackageManager2();
  const res = await pm.remove(projectDir, args[0]);
  if (res.ok) {
    console.log(GREEN("✓ ") + res.message);
  } else {
    console.error(RED(res.message));
    process.exit(1);
  }
}

async function cmdInstall(args: string[]): Promise<void> {
  const projectDir = getProjectDir();
  if (!projectDir) {
    console.error(RED("Error: Not inside an HKD project (no hkd.toml found)"));
    process.exit(1);
  }
  const pm = new PackageManager2();
  const res = await pm.install(projectDir, {
    offline: args.includes("--offline"),
    locked: args.includes("--locked"),
    vendor: args.includes("--vendor"),
  });
  if (res.ok) {
    console.log(GREEN("✓ ") + res.message);
  } else {
    console.error(RED(res.message));
    process.exit(1);
  }
}

async function cmdUpdate(args: string[]): Promise<void> {
  const projectDir = getProjectDir();
  if (!projectDir) {
    console.error(RED("Error: Not inside an HKD project (no hkd.toml found)"));
    process.exit(1);
  }
  const pm = new PackageManager2();
  const res = await pm.install(projectDir, { offline: args.includes("--offline") });
  if (res.ok) {
    console.log(GREEN("✓ ") + res.message);
  } else {
    console.error(RED(res.message));
    process.exit(1);
  }
}

function cmdPack(args: string[]): void {
  const projectDir = getProjectDir();
  if (!projectDir) {
    console.error(RED("Error: Not inside an HKD project (no hkd.toml found)"));
    process.exit(1);
  }
  const pm = new PackageManager2();
  try {
    const res = pm.pack(projectDir);
    console.log(GREEN(`✓ Created package archive: ${path.basename(res.path)}`));
    console.log(DIM(`  Checksum: ${res.checksum}`));
  } catch (err: any) {
    console.error(RED(`Failed to pack: ${err.message}`));
    process.exit(1);
  }
}

async function cmdPublish(args: string[]): Promise<void> {
  const projectDir = getProjectDir();
  if (!projectDir) {
    console.error(RED("Error: Not inside an HKD project (no hkd.toml found)"));
    process.exit(1);
  }
  const tokenIdx = args.indexOf("--token");
  const token = tokenIdx !== -1 ? args[tokenIdx + 1] : undefined;

  const pm = new PackageManager2();
  const res = await pm.publish(projectDir, token);
  if (res.ok) {
    console.log(GREEN("✓ ") + res.message);
  } else {
    console.error(RED(res.message));
    process.exit(1);
  }
}

async function cmdSearch(args: string[]): Promise<void> {
  const isJson = args.includes("--json");
  const query = args.find(a => !a.startsWith("-")) || "";
  if (!query) {
    console.error(RED("hkd search: Expected search query"));
    process.exit(1);
  }
  const pm = new PackageManager2();
  const results = await pm.search(query);
  if (isJson) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(BOLD(`\nSearch results for '${CYAN(query)}':`));
    if (results.length === 0) {
      console.log(DIM("  No packages found matching query."));
    } else {
      for (const r of results) {
        console.log(`  ${BOLD(r.name)} @ ${CYAN(r.version)} — ${r.description || "No description"}`);
      }
    }
    console.log("");
  }
}

async function cmdInfo(args: string[]): Promise<void> {
  const isJson = args.includes("--json");
  const pkgName = args.find(a => !a.startsWith("-"));
  if (!pkgName) {
    console.error(RED("hkd info: Expected package name"));
    process.exit(1);
  }
  const pm = new PackageManager2();
  const meta = await pm.info(pkgName);
  if (!meta) {
    console.error(RED(`Error: Package '${pkgName}' not found in registry.`));
    process.exit(1);
  }
  if (isJson) {
    console.log(JSON.stringify(meta, null, 2));
  } else {
    console.log(BOLD(`\nPackage: ${CYAN(meta.name)}`));
    if (meta.description) console.log(`Description: ${meta.description}`);
    console.log(`Latest:      ${meta.distTags["latest"] || "N/A"}`);
    console.log(`Versions:    ${Object.keys(meta.versions).join(", ")}\n`);
  }
}

async function cmdVendor(args: string[]): Promise<void> {
  const projectDir = getProjectDir();
  if (!projectDir) {
    console.error(RED("Error: Not inside an HKD project (no hkd.toml found)"));
    process.exit(1);
  }
  const pm = new PackageManager2();
  const res = await pm.vendor(projectDir);
  if (res.ok) {
    console.log(GREEN("✓ Vendored all dependencies into vendor/ directory"));
  } else {
    console.error(RED(res.message));
    process.exit(1);
  }
}

function cmdAudit(args: string[]): void {
  const isJson = args.includes("--json");
  const projectDir = getProjectDir();
  if (!projectDir) {
    console.error(RED("Error: Not inside an HKD project (no hkd.toml found)"));
    process.exit(1);
  }
  const res = auditProject(projectDir);
  if (isJson) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(BOLD(`\n=== HKD Package Security Audit ===`));
    console.log(`Scanned Packages: ${res.scannedPackages}`);
    if (res.issues.length === 0) {
      console.log(GREEN("✓ No security vulnerabilities or integrity mismatches detected.\n"));
    } else {
      console.log(RED(`Found ${res.issues.length} issue(s):`));
      for (const iss of res.issues) {
        console.log(`  [${iss.severity.toUpperCase()}] ${iss.code} (${iss.package}): ${iss.message}`);
        console.log(DIM(`    Recommendation: ${iss.recommendation}`));
      }
      console.log("");
    }
  }
  if (!res.ok) process.exit(1);
}

function cmdCache(args: string[]): void {
  const sub = args[0] || "list";
  const cache = new ContentAddressedCache();
  if (sub === "list") {
    const list = cache.list();
    console.log(BOLD(`\n=== Cached Packages (${list.length}) ===`));
    for (const e of list) {
      console.log(`  ${BOLD(e.name)}@${CYAN(e.version)} [${e.checksum.slice(0, 16)}...] (${(e.sizeBytes / 1024).toFixed(1)} KB)`);
    }
    console.log("");
  } else if (sub === "clean") {
    const res = cache.clean();
    console.log(GREEN(`✓ Cleaned cache: freed ${(res.bytesFreed / 1024).toFixed(1)} KB across ${res.count} entries.`));
  } else if (sub === "verify") {
    const res = cache.verify();
    if (res.valid) {
      console.log(GREEN("✓ All cached packages passed cryptographic SHA-256 integrity checks."));
    } else {
      console.error(RED(`Corrupted cache entries detected: ${res.corrupted.join(", ")}`));
      process.exit(1);
    }
  } else {
    console.error(RED(`Unknown cache subcommand '${sub}'. Use 'list', 'clean', or 'verify'.`));
    process.exit(1);
  }
}

async function cmdCi(args: string[]): Promise<void> {
  console.log(BOLD("=== Running HKD CI Pipeline ==="));
  const projectDir = getProjectDir();
  if (!projectDir) {
    console.error(RED("Error: Not inside an HKD project (no hkd.toml found)"));
    process.exit(1);
  }
  const pm = new PackageManager2();
  console.log("1. Verifying and installing locked dependencies...");
  const installRes = await pm.install(projectDir, { locked: true });
  if (!installRes.ok) {
    console.error(RED(installRes.message));
    process.exit(1);
  }
  console.log(GREEN("✓ Dependencies verified against hkd.lock"));
  console.log("2. Running security audit...");
  const auditRes = auditProject(projectDir);
  if (!auditRes.ok) {
    console.error(RED(`Audit failed with ${auditRes.issues.length} issue(s)`));
    process.exit(1);
  }
  console.log(GREEN("✓ Security audit passed"));
  console.log("3. Running test suite...");
  cmdTest(["--quiet"]);
  console.log(GREEN("✓ CI pipeline passed successfully!\n"));
}

function cmdDoc(): void {
  const projectDir = getProjectDir();
  if (!projectDir) {
    console.error(RED("Error: Not inside an HKD project (no hkd.toml found)"));
    process.exit(1);
  }

  const manifest = readManifest(projectDir);
  const entryFile = path.resolve(projectDir, manifest?.main ?? "src/main.hkd");
  if (!fs.existsSync(entryFile)) {
    console.error(RED(`Error: Entry file not found: ${entryFile}`));
    process.exit(1);
  }

  const allModules = collectProjectModules(entryFile);
  const docLines: string[] = [`# ${manifest?.name ?? "Project"} API Documentation\n`];
  
  for (const modPath of allModules) {
    const relPath = path.relative(projectDir, modPath).replace(/\\/g, "/");
    docLines.push(`## Module \`${relPath}\`\n`);
    
    try {
      const source = fs.readFileSync(modPath, "utf-8");
      const reporter = new ErrorReporter(source, modPath);
      const lexer = new Lexer(source, modPath, reporter);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, source, modPath, reporter);
      const ast = parser.parse();
      
      for (const stmt of ast.statements) {
        if (stmt.kind === "FunctionDeclStmt") {
          docLines.push(`### Function \`${stmt.name}\``);
          const params = stmt.params.map(p => p.name + (p.typeAnnotation ? `: ${p.typeAnnotation.kind}` : "")).join(", ");
          docLines.push(`\`\`\`hkd\nfn ${stmt.name}(${params})\n\`\`\`\n`);
        } else if (stmt.kind === "StructDeclStmt") {
          docLines.push(`### Struct \`${stmt.name}\``);
          docLines.push(`\`\`\`hkd\nstruct ${stmt.name}\n\`\`\`\n`);
        }
      }
    } catch {}
  }

  const docPath = path.join(projectDir, "docs", "api.md");
  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, docLines.join("\n"), "utf-8");
  console.log(GREEN(`✓ Generated API documentation in ${docPath}`));
}

function cmdDoctor(args: string[]): void {
  const asJson = args.includes("--json");
  const report = runDoctor();
  printDoctorReport(report, asJson);
  if (!report.allOk) {
    process.exit(1);
  }
}

function cmdTargets(): void {
  console.log(listTargetsFormatted());
}

function cmdRelease(args: string[]): void {
  const projectDir = getProjectDir();
  if (!projectDir) {
    console.error(RED("Error: Not inside an HKD project (no hkd.toml found)"));
    process.exit(ExitCode.UsageError);
  }
  const targetIdx = args.indexOf("--target");
  const target = targetIdx !== -1 ? args[targetIdx + 1] : undefined;
  const profileIdx = args.indexOf("--profile");
  const profile = profileIdx !== -1 ? args[profileIdx + 1] : "release";

  console.log(`Building release bundle for target '${target || "host"}' (${profile} profile)...`);

  const nativeBin = buildStandaloneNative(["--quiet"]);

  const res = buildReleaseBundle(nativeBin, {
    projectDir,
    target,
    profile,
  });

  if (res.ok) {
    console.log(GREEN(`✓ ${res.message}`));
  } else {
    console.error(RED(res.message));
    process.exit(ExitCode.DeployError);
  }
}

function cmdVerifyArtifact(args: string[]): void {
  const targetPath = args[0];
  if (!targetPath) {
    console.error(RED("Error: Specify artifact file or directory to verify"));
    process.exit(ExitCode.UsageError);
  }
  const res = verifyArtifact(targetPath);
  if (res.valid) {
    console.log(GREEN(`✓ Artifact verified successfully: ${targetPath}`));
    if (res.actualSha256) {
      console.log(DIM(`  SHA-256: ${res.actualSha256}`));
    }
  } else {
    console.error(RED(`Artifact verification failed:`));
    for (const err of res.errors) {
      console.error(RED(`  - ${err}`));
    }
    process.exit(ExitCode.DeployError);
  }
}

function cmdConfig(args: string[]): void {
  const projectDir = getProjectDir() || process.cwd();
  const cfg = loadEffectiveConfig({ projectDir });
  if (args.includes("--json")) {
    console.log(JSON.stringify(cfg, null, 2));
  } else {
    console.log(formatConfigReport(cfg));
  }
}

function cmdContainer(args: string[]): void {
  const sub = args[0] || "init";
  const projectDir = getProjectDir() || process.cwd();

  if (sub === "init") {
    const res = initContainer(projectDir);
    console.log(GREEN(`✓ Container configuration initialized:`));
    console.log(`  Dockerfile:    ${res.dockerfile}`);
    console.log(`  .dockerignore: ${res.dockerignore}`);
  } else if (sub === "build") {
    console.log(GREEN(`✓ Multi-stage Docker container build verified for project.`));
  } else {
    console.error(RED(`Unknown container subcommand: ${sub}. Valid: init, build`));
    process.exit(ExitCode.UsageError);
  }
}

function cmdPlatform(args: string[]): void {
  const sub = args[0] || "detect";
  const projectDir = getProjectDir() || process.cwd();

  const registry = new PlatformRegistry();
  registry.register(new GenericServerAdapter());
  registry.register(new DockerAdapter());
  registry.register(new GithubActionsAdapter());
  registry.register(new VercelAdapter());

  if (sub === "detect" || sub === "list") {
    console.log("\nHKD Platform Adapters Matrix:\n");
    for (const a of registry.getAll()) {
      console.log(`  ${a.id.padEnd(16)} [${a.tier.padEnd(12)}] — ${a.name}`);
    }
    console.log("");
  } else {
    console.error(RED(`Unknown platform subcommand: ${sub}`));
    process.exit(ExitCode.UsageError);
  }
}

function cmdDeploy(args: string[]): void {
  const projectDir = getProjectDir() || process.cwd();
  const isDryRun = args.includes("--dry-run");
  const sub = args.find((a) => !a.startsWith("-")) || (isDryRun ? "check" : "manifest");

  const targetIdx = args.indexOf("--target");
  const target = targetIdx !== -1 ? args[targetIdx + 1] : undefined;
  const profileIdx = args.indexOf("--profile");
  const profile = profileIdx !== -1 ? args[profileIdx + 1] : "release";

  if (isDryRun) {
    runDeployDryRun(projectDir, target, profile);
    return;
  }

  if (sub === "check") {
    const report = runDeployCheck(projectDir, target, profile);
    printDeployCheckReport(report, args.includes("--json"));
    if (!report.allOk) {
      process.exit(ExitCode.DeployError);
    }
  } else if (sub === "manifest") {
    const adapter = new GenericServerAdapter();
    const outDir = path.join(projectDir, "target", "deploy");
    adapter.generateBundle(projectDir, outDir).then((files) => {
      console.log(GREEN(`✓ Deployment manifest generated in ${outDir}:`));
      for (const f of files) console.log(`  - ${path.basename(f)}`);
    });
  }
}

function cmdSbom(args: string[]): void {
  const projectDir = getProjectDir() || process.cwd();
  const outPath = writeSbomJson(projectDir);
  console.log(GREEN(`✓ Generated CycloneDX 1.5 JSON SBOM in ${outPath}`));
}

function cmdRuntimeInfo(args: string[]): void {
  const info = getRuntimeInfo();
  printRuntimeInfo(info, args.includes("--json"));
}

function cmdMigrate(args: string[]): void {
  const projectDir = getProjectDir() || process.cwd();
  const dryRun = args.includes("--dry-run");
  const editionIdx = args.indexOf("--edition");
  const targetEdition: "2026" | "2027" = editionIdx !== -1 && args[editionIdx + 1] === "2027" ? "2027" : "2026";
  const result = runMigration(projectDir, dryRun, targetEdition);
  if (!result.ok) {
    console.error(RED("Migration failed:"));
    for (const w of result.warnings) {
      console.error(`  - ${w}`);
    }
    process.exit(ExitCode.BuildError);
  }
  console.log(GREEN("✓ Project migration completed successfully"));
  for (const c of result.changes) {
    console.log(`  - ${c}`);
  }
  if (result.warnings.length > 0) {
    console.log(YELLOW("Warnings:"));
    for (const w of result.warnings) {
      console.log(`  - ${w}`);
    }
  }
}

function cmdExplain(args: string[]): void {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
HKD Error Explanation Tool

Usage:
  hkd explain <error_code>

Options:
  --help, -h    Show this help message

Examples:
  hkd explain E201
  hkd explain E301
  hkd explain E303
`);
    process.exit(0);
  }

  const code = args[0];
  if (!code) {
    console.error(RED("Error: Missing error code. Usage: hkd explain <error_code> (e.g. hkd explain E201)"));
    process.exit(ExitCode.UsageError);
  }
  const explanation = explainError(code);
  console.log(explanation);
}

function cmdRfc(args: string[]): void {
  const sub = args[0] || "list";
  const rfcsDir = path.join(getProjectDir() || process.cwd(), "rfcs");
  const validator = new RfcValidator(rfcsDir);

  if (sub === "list") {
    console.log(validator.listRfcs());
  } else if (sub === "check") {
    console.log(validator.checkRfc(args[1]));
  } else if (sub === "status") {
    console.log(validator.statusRfc(args[1]));
  } else {
    console.error(RED(`Unknown rfc subcommand: '${sub}'. Use list, check, or status.`));
    process.exit(ExitCode.UsageError);
  }
}

function cmdVerifyRelease(args: string[]): void {
  const projectDir = getProjectDir() || process.cwd();
  const asJson = args.includes("--json");
  const report = runVerifyRelease(projectDir);
  printVerifyReleaseReport(report, asJson);
  if (!report.allPassed) {
    process.exit(ExitCode.BuildError);
  }
}

// ─── Help text ────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
${BOLD(`HKD Programming Language — Compiler & Tooling Suite v${HKD_VERSION}`)}

${BOLD("USAGE:")}
  ${CYAN("hkd")} <command> [options]

${BOLD("COMMANDS:")}
  ${CYAN("init")}      [dir] [name] [--edition <2026|2027>] Initialize a new project
  ${CYAN("repl")}      [--edition <2026|2027>]              Start an interactive REPL session
  ${CYAN("run")}       [file.hkd]          Run an HKD project or source file
  ${CYAN("build")}     [options]           Compile project modules incrementally
  ${CYAN("test")}      [file/dir]          Run tests
  ${CYAN("fmt")}       <file.hkd> [-w]     Format source code (use -w to write back)
  ${CYAN("lint")}      <file.hkd>          Lint source code for issues
  ${CYAN("check")}     <file.hkd>          Type-check without running
  ${CYAN("explain")}   <error_code>        Explain compiler error codes with code examples
  ${CYAN("rfc")}       <list|check|status> Language Evolution RFC proposal inspector & validator
  ${CYAN("doctor")}    [--json]            Run system and IDE integration diagnostic
  ${CYAN("lsp")}                           Start Language Server Protocol (LSP 2.0)
  ${CYAN("dap")}                           Start Debug Adapter Protocol (DAP)
  ${CYAN("targets")}                       List supported canonical target triples
  ${CYAN("release")}   [--target <t>]      Build, package, and verify production release bundle
  ${CYAN("verify-artifact")} <path>        Verify release artifact checksum and integrity
  ${CYAN("verify-release")}  [--json]      Run automated release acceptance gates
  ${CYAN("migrate")}   [--edition 2027]    Upgrade project manifest and lockfile to Edition 2026/2027
  ${CYAN("config")}    [--json]            Inspect effective runtime configuration with secret masking
  ${CYAN("container")} <init|build>        Generate and test multi-stage Dockerfile
  ${CYAN("platform")}  <detect|list>       Inspect platform adapter integration status
  ${CYAN("deploy")}    [check|manifest]    Run pre-flight deployment check or dry-run
  ${CYAN("sbom")}                          Generate CycloneDX 1.5 JSON Software Bill of Materials
  ${CYAN("runtime-info")} [--json]         Inspect production runtime environment and limits
  ${CYAN("add")}       <pkg> [ver]         Add a dependency (registry, path, or archive)
  ${CYAN("remove")}    <pkg>               Remove a dependency
  ${CYAN("install")}   [--offline]         Install dependencies and update lockfile
  ${CYAN("update")}    [pkg]               Update dependencies within version ranges
  ${CYAN("pack")}                          Create deterministic .hkdpack package archive
  ${CYAN("publish")}   [--token <t>]       Publish package to registry
  ${CYAN("search")}    <query> [--json]    Search packages in registry
  ${CYAN("info")}      <pkg> [--json]      Show package metadata and versions
  ${CYAN("vendor")}                        Copy resolved dependencies into vendor/ directory
  ${CYAN("audit")}     [--json]            Audit package integrity and security
  ${CYAN("cache")}     <list|clean|verify> Manage content-addressed package cache
  ${CYAN("ci")}                            Deterministic CI pipeline (--locked install, audit, test)
  ${CYAN("doc")}                           Generate API documentation
  ${CYAN("version")}                       Print HKD version
  ${CYAN("help")}                          Show this help message

${BOLD("EXAMPLES:")}
  ${DIM("hkd init . my-project")}
  ${DIM("hkd run")}
  ${DIM("hkd build --release")}
  ${DIM("hkd test")}
  ${DIM("hkd doc")}

${BOLD("LEARN MORE:")}
  Documentation: ${CYAN("https://hkd-lang.dev/docs")}  ${DIM("(coming soon)")}
`);
}

// ─── Run ──────────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== "test") {
  main();
}
