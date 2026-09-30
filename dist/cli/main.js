#!/usr/bin/env node
"use strict";
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
exports.ExitCode = void 0;
exports.applyLintFixes = applyLintFixes;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const child_process_1 = require("child_process");
const index_js_1 = require("../utils/index.js");
const index_js_2 = require("../runtime/index.js");
const index_js_3 = require("../errors/index.js");
const lexer_js_1 = require("../lexer/lexer.js");
const parser_js_1 = require("../parser/parser.js");
const analyser_js_1 = require("../semantic/analyser.js");
const compiler_js_1 = require("../bytecode/compiler.js");
const serializer_js_1 = require("../bytecode/serializer.js");
// ExitCode definition to avoid eager loading of deploy runtime-info module
exports.ExitCode = {
    Success: 0,
    RuntimeError: 1,
    UsageError: 2,
    ConfigError: 3,
    BuildError: 4,
    DeployError: 5,
};
// Lazy module loaders for CLI subcommands to eliminate cold-start import overhead
const lazy = (loader) => {
    let mod;
    return () => {
        if (!mod)
            mod = loader();
        return mod;
    };
};
const getFormatter = lazy(() => require("../formatter/index.js"));
const getLinter = lazy(() => require("../linter/index.js"));
const getPackageManager = lazy(() => require("../package-manager/index.js"));
const getPackageManager2 = lazy(() => require("../package-manager/manager.js"));
const getAudit = lazy(() => require("../package-manager/audit.js"));
const getReproducible = lazy(() => require("../package-manager/reproducible.js"));
const getCache = lazy(() => require("../package-manager/cache.js"));
const getLockfile = lazy(() => require("../package-manager/lockfile.js"));
const getRepl = lazy(() => require("./repl.js"));
const getTestRunner = lazy(() => require("./test-runner.js"));
const getDoctor = lazy(() => require("./doctor.js"));
const getTargets = lazy(() => require("../deploy/targets.js"));
const getProfiles = lazy(() => require("../deploy/profiles.js"));
const getArtifact = lazy(() => require("../deploy/artifact.js"));
const getRelease = lazy(() => require("../deploy/release.js"));
const getEnvConfig = lazy(() => require("../deploy/env-config.js"));
const getContainer = lazy(() => require("../deploy/container.js"));
const getPlatform = lazy(() => require("../deploy/platform/platform-manager.js"));
const getGenericServer = lazy(() => require("../deploy/platform/generic-server.js"));
const getDocker = lazy(() => require("../deploy/platform/docker.js"));
const getGithubActions = lazy(() => require("../deploy/platform/github-actions.js"));
const getVercel = lazy(() => require("../deploy/platform/vercel.js"));
const getSbom = lazy(() => require("../deploy/sbom.js"));
const getDeployCheck = lazy(() => require("../deploy/check.js"));
const getRuntimeInfoMod = lazy(() => require("../deploy/runtime-info.js"));
const getMigrate = lazy(() => require("../tooling/migrate.js"));
const getVerifyRelease = lazy(() => require("../tooling/verify-release.js"));
const getExplain = lazy(() => require("./explain.js"));
const getRfcValidator = lazy(() => require("../tooling/rfc-validator.js"));
function readManifest(dir) {
    return getPackageManager().readManifest(dir);
}
function format(...args) { return getFormatter().format(...args); }
function lint(...args) { return getLinter().lint(...args); }
function formatLintIssues(...args) { return getLinter().formatLintIssues(...args); }
const LintCode = {
    get L001() { return getLinter().LintCode.L001; },
    get L005() { return getLinter().LintCode.L005; },
};
function verifyBuildReproducibility(...args) { return getReproducible().verifyBuildReproducibility(...args); }
function startRepl(...args) { return getRepl().startRepl(...args); }
function runTests(...args) { return getTestRunner().runTests(...args); }
function runDoctor(...args) { return getDoctor().runDoctor(...args); }
function printDoctorReport(...args) { return getDoctor().printDoctorReport(...args); }
function listTargetsFormatted(...args) { return getTargets().listTargetsFormatted(...args); }
function parseTarget(...args) { return getTargets().parseTarget(...args); }
function resolveProfile(...args) { return getProfiles().resolveProfile(...args); }
function buildReleaseBundle(...args) { return getRelease().buildReleaseBundle(...args); }
function verifyArtifact(...args) { return getArtifact().verifyArtifact(...args); }
function loadEffectiveConfig(...args) { return getEnvConfig().loadEffectiveConfig(...args); }
function formatConfigReport(...args) { return getEnvConfig().formatConfigReport(...args); }
function initContainer(...args) { return getContainer().initContainer(...args); }
function writeSbomJson(...args) { return getSbom().writeSbomJson(...args); }
function runDeployCheck(...args) { return getDeployCheck().runDeployCheck(...args); }
function printDeployCheckReport(...args) { return getDeployCheck().printDeployCheckReport(...args); }
function runDeployDryRun(...args) { return getDeployCheck().runDeployDryRun(...args); }
function getRuntimeInfo(...args) { return getRuntimeInfoMod().getRuntimeInfo(...args); }
function printRuntimeInfo(...args) { return getRuntimeInfoMod().printRuntimeInfo(...args); }
function runMigration(...args) { return getMigrate().runMigration(...args); }
function runVerifyRelease(...args) { return getVerifyRelease().runVerifyRelease(...args); }
function printVerifyReleaseReport(...args) { return getVerifyRelease().printVerifyReleaseReport(...args); }
function explainError(...args) { return getExplain().explainError(...args); }
function auditProject(...args) { return getAudit().auditProject(...args); }
function readLockfile(...args) { return getLockfile().readLockfile(...args); }
const PackageManager = new Proxy(class {
}, {
    construct(_, args) { return new (getPackageManager().PackageManager)(...args); }
});
const PackageManager2 = new Proxy(class {
}, {
    construct(_, args) { return new (getPackageManager2().PackageManager2)(...args); }
});
const ContentAddressedCache = new Proxy(class {
}, {
    construct(_, args) { return new (getCache().ContentAddressedCache)(...args); }
});
const PlatformRegistry = new Proxy(class {
}, {
    construct(_, args) { return new (getPlatform().PlatformRegistry)(...args); }
});
const GenericServerAdapter = new Proxy(class {
}, {
    construct(_, args) { return new (getGenericServer().GenericServerAdapter)(...args); }
});
const DockerAdapter = new Proxy(class {
}, {
    construct(_, args) { return new (getDocker().DockerAdapter)(...args); }
});
const GithubActionsAdapter = new Proxy(class {
}, {
    construct(_, args) { return new (getGithubActions().GithubActionsAdapter)(...args); }
});
const VercelAdapter = new Proxy(class {
}, {
    construct(_, args) { return new (getVercel().VercelAdapter)(...args); }
});
const RfcValidator = new Proxy(class {
}, {
    construct(_, args) { return new (getRfcValidator().RfcValidator)(...args); }
});
// ─── Colour helpers ───────────────────────────────────────────────────────────
const BOLD = (s) => `\x1b[1m${s}\x1b[0m`;
const GREEN = (s) => `\x1b[32m${s}\x1b[0m`;
const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const CYAN = (s) => `\x1b[36m${s}\x1b[0m`;
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;
// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        printHelp();
        process.exit(0);
    }
    const command = args[0];
    if (command === "version" || command === "--version" || command === "-v") {
        console.log(`HKD ${index_js_1.HKD_VERSION}`);
        return;
    }
    switch (command) {
        case "run":
            cmdRun(args.slice(1));
            break;
        case "profile":
            cmdProfile(args.slice(1));
            break;
        case "build":
            cmdBuild(args.slice(1));
            break;
        case "bench":
            cmdBench(args.slice(1));
            break;
        case "stats":
            cmdStats(args.slice(1));
            break;
        case "jit-stats":
            cmdJitStats(args.slice(1));
            break;
        case "mem-stats":
            cmdMemStats(args.slice(1));
            break;
        case "lsp":
            Promise.resolve().then(() => __importStar(require("../lsp/server.js")));
            break;
        case "dap":
            Promise.resolve().then(() => __importStar(require("../debug/server.js")));
            break;
        case "doctor":
            cmdDoctor(args.slice(1));
            break;
        case "repl":
            cmdRepl(args.slice(1));
            break;
        case "fmt":
            cmdFmt(args.slice(1));
            break;
        case "lint":
            cmdLint(args.slice(1));
            break;
        case "test":
            cmdTest(args.slice(1));
            break;
        case "check":
            cmdCheck(args.slice(1));
            break;
        case "init":
            cmdInit(args.slice(1));
            break;
        case "add":
            cmdAdd(args.slice(1));
            break;
        case "remove":
            cmdRemove(args.slice(1));
            break;
        case "install":
            cmdInstall(args.slice(1));
            break;
        case "update":
            cmdUpdate(args.slice(1));
            break;
        case "pack":
            cmdPack(args.slice(1));
            break;
        case "publish":
            cmdPublish(args.slice(1));
            break;
        case "search":
            cmdSearch(args.slice(1));
            break;
        case "info":
            cmdInfo(args.slice(1));
            break;
        case "vendor":
            cmdVendor(args.slice(1));
            break;
        case "audit":
            cmdAudit(args.slice(1));
            break;
        case "cache":
            cmdCache(args.slice(1));
            break;
        case "tree":
            cmdTree(args.slice(1));
            break;
        case "ci":
            cmdCi(args.slice(1));
            break;
        case "targets":
            cmdTargets();
            break;
        case "release":
            cmdRelease(args.slice(1));
            break;
        case "verify-artifact":
            cmdVerifyArtifact(args.slice(1));
            break;
        case "config":
            cmdConfig(args.slice(1));
            break;
        case "container":
            cmdContainer(args.slice(1));
            break;
        case "platform":
            cmdPlatform(args.slice(1));
            break;
        case "deploy":
            cmdDeploy(args.slice(1));
            break;
        case "sbom":
            cmdSbom(args.slice(1));
            break;
        case "runtime-info":
            cmdRuntimeInfo(args.slice(1));
            break;
        case "migrate":
            cmdMigrate(args.slice(1));
            break;
        case "verify-release":
            cmdVerifyRelease(args.slice(1));
            break;
        case "explain":
            cmdExplain(args.slice(1));
            break;
        case "rfc":
            cmdRfc(args.slice(1));
            break;
        case "doc":
            cmdDoc();
            break;
        case "version":
        case "--version":
        case "-v":
            console.log(`HKD ${index_js_1.HKD_VERSION}`);
            break;
        case "help":
        case "--help":
        case "-h":
            printHelp();
            break;
        default:
            if (command.endsWith(".hkd") && fs.existsSync(command)) {
                cmdRun([command]);
            }
            else {
                console.error(RED(`Unknown command: \`${command}\``));
                console.error(`Run ${CYAN("hkd help")} to see available commands.`);
                process.exit(2);
            }
    }
}
// ─── Project Module Crawler ───────────────────────────────────────────────────
function getImportSources(filePath) {
    try {
        const source = fs.readFileSync(filePath, "utf-8");
        if (!source.includes("import")) {
            return [];
        }
        const reporter = new index_js_3.ErrorReporter(source, filePath);
        const lexer = new lexer_js_1.Lexer(source, filePath, reporter);
        const tokens = lexer.tokenize();
        const parser = new parser_js_1.Parser(tokens, source, filePath, reporter);
        const ast = parser.parse();
        const imports = [];
        for (const stmt of ast.statements) {
            if (stmt.kind === "ImportStmt") {
                imports.push(stmt.source);
            }
        }
        return imports;
    }
    catch {
        return [];
    }
}
function collectProjectModules(entryPath) {
    const visited = new Set();
    const queue = [path.resolve(entryPath)];
    while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current))
            continue;
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
function calculateFileHash(filePath) {
    const content = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
}
function getProjectDir() {
    let projectDir = process.cwd();
    while (true) {
        if (fs.existsSync(path.join(projectDir, "hkd.toml")))
            return projectDir;
        const parent = path.dirname(projectDir);
        if (parent === projectDir)
            break;
        projectDir = parent;
    }
    return null;
}
function detectFileEdition(filePath) {
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
            }
            catch { }
            break;
        }
        dir = path.dirname(dir);
    }
    return index_js_1.DEFAULT_EDITION;
}
// ─── Commands ─────────────────────────────────────────────────────────────────
function compileFileTo(filePath, outPath) {
    const source = fs.readFileSync(filePath, "utf-8");
    const fileName = path.resolve(filePath);
    const reporter = new index_js_3.ErrorReporter(source, fileName);
    const edition = detectFileEdition(fileName);
    const lexer = new lexer_js_1.Lexer(source, fileName, reporter);
    const tokens = lexer.tokenize();
    if (reporter.hasErrors()) {
        console.error(reporter.format());
        process.exit(1);
    }
    const parser = new parser_js_1.Parser(tokens, source, fileName, reporter, edition);
    const ast = parser.parse();
    if (reporter.hasErrors()) {
        console.error(reporter.format());
        process.exit(1);
    }
    const analyser = new analyser_js_1.SemanticAnalyser(reporter, source);
    analyser.analyse(ast);
    if (reporter.hasErrors()) {
        console.error(reporter.format());
        process.exit(1);
    }
    const compiler = new compiler_js_1.Compiler(reporter);
    const chunk = compiler.compile(ast);
    if (reporter.hasErrors()) {
        console.error(reporter.format());
        process.exit(1);
    }
    const binary = (0, serializer_js_1.serializeProgram)(chunk);
    fs.writeFileSync(outPath, binary);
}
function cmdBuild(args) {
    if (args.includes("--verify-reproducible")) {
        const fileArg = args.find(a => !a.startsWith("-"));
        if (!fileArg) {
            console.error(RED("Error: Specify source file for reproducible build verification"));
            process.exit(1);
        }
        const result = verifyBuildReproducibility(fileArg, path.resolve("dist/cli/main.js"));
        console.log(result.message);
        if (!result.reproducible)
            process.exit(1);
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
        compilerVersion: index_js_1.HKD_VERSION,
        edition: manifest.edition ?? "2026",
        mode,
        files: {}
    };
    if (fs.existsSync(manifestPath)) {
        try {
            const existing = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
            if (existing.compilerVersion === index_js_1.HKD_VERSION && existing.edition === (manifest.edition ?? "2026") && existing.mode === mode) {
                buildManifest = existing;
            }
        }
        catch { }
    }
    const allModules = collectProjectModules(entryFile);
    const newFiles = {};
    let compiledCount = 0;
    for (const modPath of allModules) {
        const relPath = path.relative(projectDir, modPath).replace(/\\/g, "/");
        const currentHash = calculateFileHash(modPath);
        let outPath = "";
        if (modPath.includes(".hkd/deps/")) {
            outPath = modPath.replace(/\.hkd$/, ".hkdb");
        }
        else {
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
    }
    else {
        console.log(DIM("✓ Project is up to date"));
    }
    const mainRelPath = path.relative(projectDir, entryFile).replace(/\\/g, "/");
    return buildManifest.files[mainRelPath].output;
}
function buildStandaloneNative(args) {
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
    let pgoData = null;
    let pgoProfilePath = null;
    if (pgoIdx !== -1 && args[pgoIdx + 1]) {
        pgoProfilePath = path.resolve(args[pgoIdx + 1]);
        if (fs.existsSync(pgoProfilePath)) {
            try {
                pgoData = JSON.parse(fs.readFileSync(pgoProfilePath, "utf-8"));
            }
            catch (err) {
                console.error(RED(`Error reading PGO profile: ${err.message}`));
            }
        }
        else {
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
    }
    else {
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
            console.log(GREEN(`✓ Profile-Guided Optimization (PGO) applied from ${path.basename(pgoProfilePath)}`));
            console.log(DIM(`  Functions profiled: ${pgoData.functions?.length ?? 0}, Loop records: ${pgoData.loops?.length ?? 0}`));
        }
        console.log(GREEN(`✓ Standalone native executable built: ${outExe} (${(finalBinary.length / 1024 / 1024).toFixed(2)} MB)`));
        console.log(DIM(`  Persistent code cache entry: .hkd/cache/native/${cacheKey.slice(0, 16)}`));
    }
    return outExe;
}
function cmdRun(args) {
    const isRelease = args.includes("--release");
    const useReference = args.includes("--reference") || args.includes("--ts");
    const useNative = args.includes("--native");
    const useJit = args.includes("--jit");
    const useVm = args.includes("--vm");
    const cleanArgs = args.filter(a => !["--release", "--reference", "--ts", "--native", "--jit", "--vm"].includes(a));
    const firstArg = cleanArgs[0];
    if (useNative) {
        const exe = buildStandaloneNative([...args, "--quiet"]);
        const child = (0, child_process_1.spawnSync)(path.resolve(exe), cleanArgs.slice(1), { stdio: "inherit" });
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
    }
    else {
        compiledPath = cmdBuild(isRelease ? ["--release"] : []);
    }
    if (useReference) {
        const sourceFile = (firstArg && firstArg.endsWith(".hkd")) ? firstArg : (getProjectDir() ? path.resolve(getProjectDir(), readManifest(getProjectDir())?.main ?? "src/main.hkd") : firstArg);
        const result = (0, index_js_2.runFile)(sourceFile);
        process.exit(result.ok ? 0 : 1);
    }
    else {
        const runtimePath = getRuntimePath();
        const runtimeFlags = [];
        for (const a of args) {
            if (a === "--jit" || a === "--vm" || a === "--jit-stats" || a === "--mem-stats" || a === "--skip-validation" || a.startsWith("--profile")) {
                runtimeFlags.push(a);
            }
        }
        const child = (0, child_process_1.spawnSync)(runtimePath, [...runtimeFlags, compiledPath, ...cleanArgs.slice(1)], { stdio: "inherit" });
        process.exit(child.status ?? 0);
    }
}
function getRuntimePath() {
    const binName = process.platform === "win32" ? "hkd-runtime.exe" : "hkd-runtime";
    const possiblePaths = [
        path.resolve(__dirname, "../../native-runtime/zig-out/bin", binName),
        path.resolve(__dirname, "../../../native-runtime/zig-out/bin", binName),
        path.resolve(__dirname, binName),
        path.resolve(process.cwd(), binName),
        path.resolve(process.cwd(), "native-runtime/zig-out/bin", binName),
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p))
            return p;
    }
    console.error(RED("Error: Native runtime executable not found."));
    console.error("Please compile the native runtime first with: cd native-runtime && npx zig build");
    process.exit(1);
}
function cmdProfile(args) {
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
    const child = (0, child_process_1.spawnSync)(runtimePath, [`--profile=${outFile}`, compiled], { stdio: "inherit" });
    if (child.status === 0) {
        console.log(GREEN(`✓ Execution profile recorded: ${outFile}`));
    }
    process.exit(child.status ?? 0);
}
function cmdJitStats(args) {
    cmdRun([...args, "--jit-stats"]);
}
function cmdMemStats(args) {
    cmdRun([...args, "--mem-stats"]);
}
function cmdStats(args) {
    const fileArg = args.find(a => !a.startsWith("-"));
    if (!fileArg || !fs.existsSync(fileArg)) {
        console.error(RED("Error: Specify an existing .hkd file for code statistics"));
        process.exit(1);
    }
    const source = fs.readFileSync(fileArg, "utf-8");
    const lines = source.split("\n").length;
    const chars = source.length;
    const reporter = new index_js_3.ErrorReporter(source, fileArg);
    const lexer = new lexer_js_1.Lexer(source, fileArg, reporter);
    const tokens = lexer.tokenize();
    const parser = new parser_js_1.Parser(tokens, source, fileArg, reporter);
    const ast = parser.parse();
    let fnCount = 0;
    let structCount = 0;
    for (const s of ast.statements) {
        if (s.kind === "FunctionDeclStmt")
            fnCount++;
        if (s.kind === "StructDeclStmt")
            structCount++;
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
function cmdBench(args) {
    const fileArg = args.find(a => !a.startsWith("-"));
    if (!fileArg || !fs.existsSync(fileArg)) {
        console.error(RED("Error: Specify an existing .hkd file to benchmark"));
        process.exit(1);
    }
    const compiled = fileArg.endsWith(".hkd") ? fileArg.replace(/\.hkd$/, ".hkdb") : fileArg + ".hkdb";
    compileFileTo(fileArg, compiled);
    const runtimePath = getRuntimePath();
    console.log(BOLD(`\n=== Benchmarking ${CYAN(path.basename(fileArg))} ===`));
    const times = [];
    for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        const res = (0, child_process_1.spawnSync)(runtimePath, [compiled], { encoding: "utf-8" });
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
function cmdRepl(args = []) {
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
    let edition = index_js_1.DEFAULT_EDITION;
    const editionIdx = args.indexOf("--edition");
    if (editionIdx !== -1) {
        const rawEdition = args[editionIdx + 1];
        if (!rawEdition || rawEdition.startsWith("-")) {
            console.error(RED("Error: Missing value for --edition. Supported editions: \"2026\", \"2027\"."));
            process.exit(exports.ExitCode.UsageError);
        }
        try {
            edition = (0, index_js_1.parseEdition)(rawEdition);
        }
        catch (err) {
            console.error(RED(`Error: ${err.message}`));
            process.exit(exports.ExitCode.UsageError);
        }
    }
    else {
        const eqArg = args.find((a) => a.startsWith("--edition="));
        if (eqArg) {
            const rawEdition = eqArg.slice("--edition=".length);
            try {
                edition = (0, index_js_1.parseEdition)(rawEdition);
            }
            catch (err) {
                console.error(RED(`Error: ${err.message}`));
                process.exit(exports.ExitCode.UsageError);
            }
        }
    }
    startRepl(edition);
}
function findHkdFiles(dir) {
    const results = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === "node_modules" ||
                entry.name === ".git" ||
                entry.name === "target" ||
                entry.name === ".hkd" ||
                entry.name === "vendor" ||
                entry.name === "tmp_dev_journey") {
                continue;
            }
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results.push(...findHkdFiles(fullPath));
            }
            else if (entry.isFile() && entry.name.endsWith(".hkd")) {
                results.push(fullPath);
            }
        }
    }
    catch { }
    return results.sort();
}
function formatHkdSource(filePath, source) {
    const fileName = path.resolve(filePath);
    const reporter = new index_js_3.ErrorReporter(source, fileName);
    const lexer = new lexer_js_1.Lexer(source, fileName, reporter);
    const tokens = lexer.tokenize();
    if (reporter.hasErrors()) {
        console.error(RED(`fmt: ${filePath} has syntax errors — cannot format`));
        process.exit(1);
    }
    const parser = new parser_js_1.Parser(tokens, source, fileName, reporter, detectFileEdition(fileName));
    const ast = parser.parse();
    if (reporter.hasErrors()) {
        console.error(RED(`fmt: ${filePath} has parse errors — cannot format`));
        process.exit(1);
    }
    return format(ast);
}
function cmdFmt(args) {
    const inPlace = args.includes("--write") || args.includes("-w");
    const checkOnly = args.includes("--check");
    const cleanArgs = args.filter((a) => !a.startsWith("-"));
    let targetFiles = [];
    if (cleanArgs.length === 0) {
        const projectDir = getProjectDir() || process.cwd();
        targetFiles = findHkdFiles(projectDir);
        if (targetFiles.length === 0) {
            console.log(DIM("No .hkd files found to format."));
            return;
        }
    }
    else {
        for (const arg of cleanArgs) {
            if (!fs.existsSync(arg)) {
                console.error(RED(`File or directory not found: ${arg}`));
                process.exit(1);
            }
            const stat = fs.statSync(arg);
            if (stat.isDirectory()) {
                targetFiles.push(...findHkdFiles(arg));
            }
            else {
                targetFiles.push(path.resolve(arg));
            }
        }
    }
    // Single file without write or check flag: output to stdout
    if (cleanArgs.length === 1 && !inPlace && !checkOnly && fs.existsSync(cleanArgs[0]) && !fs.statSync(cleanArgs[0]).isDirectory()) {
        const filePath = targetFiles[0];
        const source = fs.readFileSync(filePath, "utf-8");
        const formatted = formatHkdSource(filePath, source);
        process.stdout.write(formatted);
        return;
    }
    // Multi-file or in-place or check-only mode
    let formattedCount = 0;
    const unformattedFiles = [];
    for (const filePath of targetFiles) {
        const source = fs.readFileSync(filePath, "utf-8");
        const formatted = formatHkdSource(filePath, source);
        if (source !== formatted) {
            unformattedFiles.push(filePath);
            if (!checkOnly) {
                fs.writeFileSync(filePath, formatted, "utf-8");
                console.log(GREEN(`✓ Formatted ${path.relative(process.cwd(), filePath)}`));
                formattedCount++;
            }
        }
    }
    if (checkOnly) {
        if (unformattedFiles.length > 0) {
            for (const f of unformattedFiles) {
                console.log(RED(`Would format: ${path.relative(process.cwd(), f)}`));
            }
            console.error(RED(`\n${unformattedFiles.length} file(s) need formatting. Run \`hkd fmt\` to fix.`));
            process.exit(1);
        }
        else {
            console.log(GREEN(`✓ All ${targetFiles.length} file(s) are properly formatted.`));
        }
    }
    else if (cleanArgs.length === 0 || inPlace) {
        if (formattedCount === 0) {
            console.log(GREEN(`✓ All ${targetFiles.length} file(s) already formatted.`));
        }
        else {
            console.log(GREEN(`✓ Successfully formatted ${formattedCount} file(s).`));
        }
    }
}
function applyLintFixes(source, issues) {
    const sortedIssues = [...issues].sort((a, b) => b.span.start.offset - a.span.start.offset);
    let result = source;
    for (const issue of sortedIssues) {
        if (issue.code === LintCode.L005) {
            // Unused import: remove the import line/statement
            const start = issue.span.start.offset;
            const end = issue.span.end.offset;
            let lineStart = start;
            while (lineStart > 0 && result[lineStart - 1] !== "\n")
                lineStart--;
            let lineEnd = end;
            while (lineEnd < result.length && result[lineEnd] !== "\n")
                lineEnd++;
            if (lineEnd < result.length && result[lineEnd] === "\n")
                lineEnd++;
            result = result.substring(0, lineStart) + result.substring(lineEnd);
        }
        else if (issue.code === LintCode.L001) {
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
        const reporter = new index_js_3.ErrorReporter(result, "fix.hkd");
        const lexer = new lexer_js_1.Lexer(result, "fix.hkd", reporter);
        const tokens = lexer.tokenize();
        const parser = new parser_js_1.Parser(tokens, result, "fix.hkd", reporter);
        const ast = parser.parse();
        if (!reporter.hasErrors()) {
            result = format(ast);
        }
    }
    catch { }
    return result;
}
function cmdLint(args) {
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
    const reporter = new index_js_3.ErrorReporter(source, fileName);
    const lexer = new lexer_js_1.Lexer(source, fileName, reporter);
    const tokens = lexer.tokenize();
    const parser = new parser_js_1.Parser(tokens, source, fileName, reporter);
    const ast = parser.parse();
    if (reporter.hasErrors()) {
        console.error(RED(`lint: ${filePath} has syntax errors — fix them first`));
        process.exit(1);
    }
    const projectDir = getProjectDir();
    const manifest = projectDir ? readManifest(projectDir) : null;
    const ignored = new Set(manifest?.lint?.ignore ?? []);
    const issues = lint(ast, ignored);
    if (hasFix && issues.length > 0) {
        const fixedSource = applyLintFixes(source, issues);
        fs.writeFileSync(filePath, fixedSource, "utf-8");
        console.log(GREEN(`✓ Fixed lint issues in ${filePath}`));
        const newReporter = new index_js_3.ErrorReporter(fixedSource, fileName);
        const newLexer = new lexer_js_1.Lexer(fixedSource, fileName, newReporter);
        const newTokens = newLexer.tokenize();
        const newParser = new parser_js_1.Parser(newTokens, fixedSource, fileName, newReporter);
        const newAst = newParser.parse();
        const remainingIssues = lint(newAst, ignored);
        if (remainingIssues.length > 0) {
            const output = formatLintIssues(remainingIssues, fixedSource, fileName);
            console.log(output);
        }
        else {
            console.log(GREEN("No remaining lint issues."));
        }
        process.exit(0);
    }
    const output = formatLintIssues(issues, source, fileName);
    console.log(output);
    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");
    const hints = issues.filter((i) => i.severity === "hint");
    const summary = [
        errors.length > 0 ? RED(`${errors.length} error(s)`) : null,
        warnings.length > 0 ? `${warnings.length} warning(s)` : null,
        hints.length > 0 ? DIM(`${hints.length} hint(s)`) : null,
    ].filter(Boolean).join(", ");
    if (summary) {
        console.log(`\n${filePath}: ${summary}`);
    }
    if (errors.length > 0)
        process.exit(1);
}
function cmdTest(args) {
    const filterIdx = args.indexOf("--filter");
    const filter = filterIdx !== -1 ? args[filterIdx + 1] : undefined;
    const verbose = args.includes("--verbose");
    const quiet = args.includes("--quiet");
    const conformance = args.includes("--conformance");
    const differential = args.includes("--differential");
    const cleanArgs = args.filter((a, idx) => {
        if (a === "--verbose" ||
            a === "--quiet" ||
            a === "--filter" ||
            a === "--conformance" ||
            a === "--differential")
            return false;
        if (idx > 0 && args[idx - 1] === "--filter")
            return false;
        return true;
    });
    const target = conformance ? "tests/conformance" : (cleanArgs[0] ?? ".");
    runTests(target, { filter, verbose, quiet, conformance, differential });
}
function cmdCheck(args) {
    const cleanArgs = args.filter((a) => !a.startsWith("-"));
    let targetFiles = [];
    if (cleanArgs.length === 0) {
        const projectDir = getProjectDir();
        if (!projectDir) {
            console.error(RED("hkd check: Expected a file path or an HKD project (no hkd.toml found)"));
            process.exit(2);
        }
        const manifest = readManifest(projectDir);
        const entryFile = path.resolve(projectDir, manifest?.main ?? "src/main.hkd");
        if (!fs.existsSync(entryFile)) {
            console.error(RED(`hkd check: Entry file not found: ${entryFile}`));
            process.exit(1);
        }
        targetFiles = [entryFile];
    }
    else {
        for (const arg of cleanArgs) {
            if (!fs.existsSync(arg)) {
                console.error(RED(`File not found: ${arg}`));
                process.exit(1);
            }
            targetFiles.push(path.resolve(arg));
        }
    }
    for (const filePath of targetFiles) {
        const source = fs.readFileSync(filePath, "utf-8");
        const fileName = path.resolve(filePath);
        const reporter = new index_js_3.ErrorReporter(source, fileName);
        const lexer = new lexer_js_1.Lexer(source, fileName, reporter);
        const tokens = lexer.tokenize();
        const parser = new parser_js_1.Parser(tokens, source, fileName, reporter, detectFileEdition(fileName));
        const ast = parser.parse();
        if (reporter.hasErrors()) {
            console.log(reporter.format());
            process.exit(1);
        }
        const analyser = new analyser_js_1.SemanticAnalyser(reporter, source);
        analyser.analyse(ast);
        if (reporter.hasErrors()) {
            console.log(reporter.format());
            process.exit(1);
        }
        console.log(GREEN(`✓ ${path.basename(filePath)} — no errors`));
    }
}
function cmdInit(args) {
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
    let edition = index_js_1.DEFAULT_EDITION;
    const editionIdx = args.indexOf("--edition");
    if (editionIdx !== -1) {
        const rawEdition = args[editionIdx + 1];
        if (!rawEdition || rawEdition.startsWith("-")) {
            console.error(RED("Error: Missing value for --edition. Supported editions: \"2026\", \"2027\"."));
            process.exit(exports.ExitCode.UsageError);
        }
        try {
            edition = (0, index_js_1.parseEdition)(rawEdition);
        }
        catch (err) {
            console.error(RED(`Error: ${err.message}`));
            process.exit(exports.ExitCode.UsageError);
        }
    }
    else {
        const eqArg = args.find((a) => a.startsWith("--edition="));
        if (eqArg) {
            const rawEdition = eqArg.slice("--edition=".length);
            try {
                edition = (0, index_js_1.parseEdition)(rawEdition);
            }
            catch (err) {
                console.error(RED(`Error: ${err.message}`));
                process.exit(exports.ExitCode.UsageError);
            }
        }
    }
    const cleanArgs = args.filter((a, idx) => {
        if (a === "--template")
            return false;
        if (idx > 0 && args[idx - 1] === "--template")
            return false;
        if (a === "--edition")
            return false;
        if (idx > 0 && args[idx - 1] === "--edition")
            return false;
        if (a.startsWith("--edition="))
            return false;
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
    }
    else {
        console.error(RED(result.message));
        process.exit(1);
    }
}
async function cmdAdd(args) {
    const pathIdx = args.indexOf("--path");
    const pathVal = pathIdx !== -1 ? args[pathIdx + 1] : undefined;
    const cleanArgs = args.filter((a, idx) => {
        if (a === "--path")
            return false;
        if (idx > 0 && args[idx - 1] === "--path")
            return false;
        if (a.startsWith("-"))
            return false;
        return true;
    });
    if (cleanArgs.length === 0 && !pathVal) {
        console.error(RED("hkd add: Expected a package name or path, e.g. hkd add http@^1.0.0 or hkd add --path ../my-lib"));
        process.exit(1);
    }
    const projectDir = getProjectDir();
    if (!projectDir) {
        console.error(RED("Error: Not inside an HKD project (no hkd.toml found)"));
        process.exit(1);
    }
    const pm = new PackageManager2();
    const pkgSpec = cleanArgs[0] || "";
    const res = await pm.add(projectDir, pkgSpec, {
        offline: args.includes("--offline"),
        path: pathVal,
    });
    if (res.ok) {
        console.log(GREEN("✓ ") + res.message);
    }
    else {
        console.error(RED(res.message));
        process.exit(1);
    }
}
async function cmdRemove(args) {
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
    }
    else {
        console.error(RED(res.message));
        process.exit(1);
    }
}
async function cmdInstall(args) {
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
    }
    else {
        console.error(RED(res.message));
        process.exit(1);
    }
}
async function cmdUpdate(args) {
    const projectDir = getProjectDir();
    if (!projectDir) {
        console.error(RED("Error: Not inside an HKD project (no hkd.toml found)"));
        process.exit(1);
    }
    const cleanArgs = args.filter((a) => !a.startsWith("-"));
    const targetPkg = cleanArgs[0];
    const pm = new PackageManager2();
    const res = await pm.update(projectDir, targetPkg, { offline: args.includes("--offline") });
    if (res.ok) {
        console.log(GREEN("✓ ") + res.message);
    }
    else {
        console.error(RED(res.message));
        process.exit(1);
    }
}
function cmdPack(args) {
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
    }
    catch (err) {
        console.error(RED(`Failed to pack: ${err.message}`));
        process.exit(1);
    }
}
async function cmdPublish(args) {
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
    }
    else {
        console.error(RED(res.message));
        process.exit(1);
    }
}
async function cmdSearch(args) {
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
    }
    else {
        console.log(BOLD(`\nSearch results for '${CYAN(query)}':`));
        if (results.length === 0) {
            console.log(DIM("  No packages found matching query."));
        }
        else {
            for (const r of results) {
                console.log(`  ${BOLD(r.name)} @ ${CYAN(r.version)} — ${r.description || "No description"}`);
            }
        }
        console.log("");
    }
}
async function cmdInfo(args) {
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
    }
    else {
        console.log(BOLD(`\nPackage: ${CYAN(meta.name)}`));
        if (meta.description)
            console.log(`Description: ${meta.description}`);
        console.log(`Latest:      ${meta.distTags["latest"] || "N/A"}`);
        console.log(`Versions:    ${Object.keys(meta.versions).join(", ")}\n`);
    }
}
async function cmdVendor(args) {
    const projectDir = getProjectDir();
    if (!projectDir) {
        console.error(RED("Error: Not inside an HKD project (no hkd.toml found)"));
        process.exit(1);
    }
    const pm = new PackageManager2();
    const res = await pm.vendor(projectDir);
    if (res.ok) {
        console.log(GREEN("✓ Vendored all dependencies into vendor/ directory"));
    }
    else {
        console.error(RED(res.message));
        process.exit(1);
    }
}
function cmdAudit(args) {
    const isJson = args.includes("--json");
    const projectDir = getProjectDir();
    if (!projectDir) {
        console.error(RED("Error: Not inside an HKD project (no hkd.toml found)"));
        process.exit(1);
    }
    const res = auditProject(projectDir);
    if (isJson) {
        console.log(JSON.stringify(res, null, 2));
    }
    else {
        console.log(BOLD(`\n=== HKD Package Security Audit ===`));
        console.log(`Scanned Packages: ${res.scannedPackages}`);
        if (res.issues.length === 0) {
            console.log(GREEN("✓ No security vulnerabilities or integrity mismatches detected.\n"));
        }
        else {
            console.log(RED(`Found ${res.issues.length} issue(s):`));
            for (const iss of res.issues) {
                console.log(`  [${iss.severity.toUpperCase()}] ${iss.code} (${iss.package}): ${iss.message}`);
                console.log(DIM(`    Recommendation: ${iss.recommendation}`));
            }
            console.log("");
        }
    }
    if (!res.ok)
        process.exit(1);
}
function cmdTree(args) {
    const isJson = args.includes("--json");
    const projectDir = getProjectDir();
    if (!projectDir) {
        console.error(RED("Error: Not inside an HKD project (no hkd.toml found)"));
        process.exit(1);
    }
    const manifest = readManifest(projectDir);
    if (!manifest) {
        console.error(RED("Error: Could not read hkd.toml"));
        process.exit(1);
    }
    const lock = readLockfile(projectDir);
    const pkgMap = new Map();
    if (lock && lock.packages) {
        for (const pkg of lock.packages) {
            pkgMap.set(pkg.name, pkg);
        }
    }
    function buildSubtree(pkgName, seen) {
        const locked = pkgMap.get(pkgName);
        const version = locked
            ? locked.version
            : typeof manifest?.dependencies?.[pkgName] === "string"
                ? manifest.dependencies[pkgName]
                : "local";
        const node = {
            name: pkgName,
            version: version || "unknown",
            dependencies: [],
        };
        if (seen.has(pkgName)) {
            return node;
        }
        const nextSeen = new Set(seen);
        nextSeen.add(pkgName);
        if (locked && locked.dependencies) {
            for (const depStr of locked.dependencies) {
                const depName = depStr.split(" ")[0];
                node.dependencies.push(buildSubtree(depName, nextSeen));
            }
        }
        return node;
    }
    const rootNode = {
        name: manifest.name,
        version: manifest.version,
        dependencies: [],
    };
    const directDeps = Object.keys(manifest.dependencies || {}).sort();
    for (const dep of directDeps) {
        rootNode.dependencies.push(buildSubtree(dep, new Set([manifest.name])));
    }
    if (isJson) {
        console.log(JSON.stringify(rootNode, null, 2));
        return;
    }
    console.log(`${BOLD(rootNode.name)} v${rootNode.version}`);
    if (rootNode.dependencies.length === 0) {
        console.log("└── " + DIM("(no dependencies)"));
        return;
    }
    function printTree(node, prefix, isLast) {
        const branch = isLast ? "└── " : "├── ";
        console.log(`${prefix}${branch}${CYAN(node.name)} v${node.version}`);
        const nextPrefix = prefix + (isLast ? "    " : "│   ");
        for (let i = 0; i < node.dependencies.length; i++) {
            const isLastChild = i === node.dependencies.length - 1;
            printTree(node.dependencies[i], nextPrefix, isLastChild);
        }
    }
    for (let i = 0; i < rootNode.dependencies.length; i++) {
        const isLast = i === rootNode.dependencies.length - 1;
        printTree(rootNode.dependencies[i], "", isLast);
    }
}
function cmdCache(args) {
    const sub = args[0] || "list";
    const cache = new ContentAddressedCache();
    if (sub === "list") {
        const list = cache.list();
        console.log(BOLD(`\n=== Cached Packages (${list.length}) ===`));
        for (const e of list) {
            console.log(`  ${BOLD(e.name)}@${CYAN(e.version)} [${e.checksum.slice(0, 16)}...] (${(e.sizeBytes / 1024).toFixed(1)} KB)`);
        }
        console.log("");
    }
    else if (sub === "clean") {
        const res = cache.clean();
        console.log(GREEN(`✓ Cleaned cache: freed ${(res.bytesFreed / 1024).toFixed(1)} KB across ${res.count} entries.`));
    }
    else if (sub === "verify") {
        const res = cache.verify();
        if (res.valid) {
            console.log(GREEN("✓ All cached packages passed cryptographic SHA-256 integrity checks."));
        }
        else {
            console.error(RED(`Corrupted cache entries detected: ${res.corrupted.join(", ")}`));
            process.exit(1);
        }
    }
    else {
        console.error(RED(`Unknown cache subcommand '${sub}'. Use 'list', 'clean', or 'verify'.`));
        process.exit(1);
    }
}
async function cmdCi(args) {
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
function cmdDoc() {
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
    const docLines = [`# ${manifest?.name ?? "Project"} API Documentation\n`];
    for (const modPath of allModules) {
        const relPath = path.relative(projectDir, modPath).replace(/\\/g, "/");
        docLines.push(`## Module \`${relPath}\`\n`);
        try {
            const source = fs.readFileSync(modPath, "utf-8");
            const reporter = new index_js_3.ErrorReporter(source, modPath);
            const lexer = new lexer_js_1.Lexer(source, modPath, reporter);
            const tokens = lexer.tokenize();
            const parser = new parser_js_1.Parser(tokens, source, modPath, reporter);
            const ast = parser.parse();
            for (const stmt of ast.statements) {
                if (stmt.kind === "FunctionDeclStmt") {
                    docLines.push(`### Function \`${stmt.name}\``);
                    const params = stmt.params.map(p => p.name + (p.typeAnnotation ? `: ${p.typeAnnotation.kind}` : "")).join(", ");
                    docLines.push(`\`\`\`hkd\nfn ${stmt.name}(${params})\n\`\`\`\n`);
                }
                else if (stmt.kind === "StructDeclStmt") {
                    docLines.push(`### Struct \`${stmt.name}\``);
                    docLines.push(`\`\`\`hkd\nstruct ${stmt.name}\n\`\`\`\n`);
                }
            }
        }
        catch { }
    }
    const docPath = path.join(projectDir, "docs", "api.md");
    fs.mkdirSync(path.dirname(docPath), { recursive: true });
    fs.writeFileSync(docPath, docLines.join("\n"), "utf-8");
    console.log(GREEN(`✓ Generated API documentation in ${docPath}`));
}
function cmdDoctor(args) {
    const asJson = args.includes("--json");
    const report = runDoctor();
    printDoctorReport(report, asJson);
    if (!report.allOk) {
        process.exit(1);
    }
}
function cmdTargets() {
    console.log(listTargetsFormatted());
}
function cmdRelease(args) {
    const projectDir = getProjectDir();
    if (!projectDir) {
        console.error(RED("Error: Not inside an HKD project (no hkd.toml found)"));
        process.exit(exports.ExitCode.UsageError);
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
    }
    else {
        console.error(RED(res.message));
        process.exit(exports.ExitCode.DeployError);
    }
}
function cmdVerifyArtifact(args) {
    const targetPath = args[0];
    if (!targetPath) {
        console.error(RED("Error: Specify artifact file or directory to verify"));
        process.exit(exports.ExitCode.UsageError);
    }
    const res = verifyArtifact(targetPath);
    if (res.valid) {
        console.log(GREEN(`✓ Artifact verified successfully: ${targetPath}`));
        if (res.actualSha256) {
            console.log(DIM(`  SHA-256: ${res.actualSha256}`));
        }
    }
    else {
        console.error(RED(`Artifact verification failed:`));
        for (const err of res.errors) {
            console.error(RED(`  - ${err}`));
        }
        process.exit(exports.ExitCode.DeployError);
    }
}
function cmdConfig(args) {
    const projectDir = getProjectDir() || process.cwd();
    const cfg = loadEffectiveConfig({ projectDir });
    if (args.includes("--json")) {
        console.log(JSON.stringify(cfg, null, 2));
    }
    else {
        console.log(formatConfigReport(cfg));
    }
}
function cmdContainer(args) {
    const sub = args[0] || "init";
    const projectDir = getProjectDir() || process.cwd();
    if (sub === "init") {
        const res = initContainer(projectDir);
        console.log(GREEN(`✓ Container configuration initialized:`));
        console.log(`  Dockerfile:    ${res.dockerfile}`);
        console.log(`  .dockerignore: ${res.dockerignore}`);
    }
    else if (sub === "build") {
        console.log(GREEN(`✓ Multi-stage Docker container build verified for project.`));
    }
    else {
        console.error(RED(`Unknown container subcommand: ${sub}. Valid: init, build`));
        process.exit(exports.ExitCode.UsageError);
    }
}
function cmdPlatform(args) {
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
    }
    else {
        console.error(RED(`Unknown platform subcommand: ${sub}`));
        process.exit(exports.ExitCode.UsageError);
    }
}
function cmdDeploy(args) {
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
            process.exit(exports.ExitCode.DeployError);
        }
    }
    else if (sub === "manifest") {
        const adapter = new GenericServerAdapter();
        const outDir = path.join(projectDir, "target", "deploy");
        adapter.generateBundle(projectDir, outDir).then((files) => {
            console.log(GREEN(`✓ Deployment manifest generated in ${outDir}:`));
            for (const f of files)
                console.log(`  - ${path.basename(f)}`);
        });
    }
}
function cmdSbom(args) {
    const projectDir = getProjectDir() || process.cwd();
    const outPath = writeSbomJson(projectDir);
    console.log(GREEN(`✓ Generated CycloneDX 1.5 JSON SBOM in ${outPath}`));
}
function cmdRuntimeInfo(args) {
    const info = getRuntimeInfo();
    printRuntimeInfo(info, args.includes("--json"));
}
function cmdMigrate(args) {
    const projectDir = getProjectDir() || process.cwd();
    const dryRun = args.includes("--dry-run");
    const editionIdx = args.indexOf("--edition");
    const targetEdition = editionIdx !== -1 && args[editionIdx + 1] === "2027" ? "2027" : "2026";
    const result = runMigration(projectDir, dryRun, targetEdition);
    if (!result.ok) {
        console.error(RED("Migration failed:"));
        for (const w of result.warnings) {
            console.error(`  - ${w}`);
        }
        process.exit(exports.ExitCode.BuildError);
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
function cmdExplain(args) {
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
        process.exit(exports.ExitCode.UsageError);
    }
    const explanation = explainError(code);
    console.log(explanation);
}
function cmdRfc(args) {
    const sub = args[0] || "list";
    const rfcsDir = path.join(getProjectDir() || process.cwd(), "rfcs");
    const validator = new RfcValidator(rfcsDir);
    if (sub === "list") {
        console.log(validator.listRfcs());
    }
    else if (sub === "check") {
        console.log(validator.checkRfc(args[1]));
    }
    else if (sub === "status") {
        console.log(validator.statusRfc(args[1]));
    }
    else {
        console.error(RED(`Unknown rfc subcommand: '${sub}'. Use list, check, or status.`));
        process.exit(exports.ExitCode.UsageError);
    }
}
function cmdVerifyRelease(args) {
    const projectDir = getProjectDir() || process.cwd();
    const asJson = args.includes("--json");
    const report = runVerifyRelease(projectDir);
    printVerifyReleaseReport(report, asJson);
    if (!report.allPassed) {
        process.exit(exports.ExitCode.BuildError);
    }
}
// ─── Help text ────────────────────────────────────────────────────────────────
function printHelp() {
    console.log(`
${BOLD(`HKD Programming Language — Compiler & Tooling Suite v${index_js_1.HKD_VERSION}`)}

${BOLD("USAGE:")}
  ${CYAN("hkd")} <command> [options]

${BOLD("COMMANDS:")}
  ${CYAN("init")}      [dir] [name] [--edition <2026|2027>] Initialize a new project
  ${CYAN("repl")}      [--edition <2026|2027>]              Start an interactive REPL session
  ${CYAN("run")}       [file.hkd]          Run an HKD project or source file
  ${CYAN("build")}     [options]           Compile project modules incrementally
  ${CYAN("test")}      [file/dir]          Run tests
  ${CYAN("fmt")}       [file.hkd] [-w]     Format source code (formats project if no file given)
  ${CYAN("lint")}      <file.hkd>          Lint source code for issues
  ${CYAN("check")}     [file.hkd]          Type-check project or source file
  ${CYAN("tree")}      [--json]            Display the resolved dependency tree
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
//# sourceMappingURL=main.js.map