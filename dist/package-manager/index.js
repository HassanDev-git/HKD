"use strict";
/**
 * HKD Package Manager
 *
 * Handles:
 *   - hkd.toml manifest parsing/writing
 *   - Local dependency resolution
 *   - Package cache (~/.hkd/packages/)
 *   - Version constraint checking (semver)
 *   - Pack/Unpack .hkdpack archives
 *   - Lockfile hkd.lock serialization/deserialization
 *
 * Offline-first, registry-ready package architecture.
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
exports.PackageManager = void 0;
exports.parseToml = parseToml;
exports.stringifyToml = stringifyToml;
exports.readManifest = readManifest;
exports.writeManifest = writeManifest;
exports.packPackage = packPackage;
exports.unpackPackage = unpackPackage;
exports.copyDirSync = copyDirSync;
exports.resolveDependencies = resolveDependencies;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const crypto = __importStar(require("crypto"));
const index_js_1 = require("../utils/index.js");
const DEFAULT_MANIFEST = {
    name: "",
    version: "0.1.0",
    edition: index_js_1.DEFAULT_EDITION,
    description: "",
    author: "",
    license: "MIT",
    main: "src/main.hkd",
    dependencies: {},
    devDependencies: {},
};
// ─── Simple TOML parser & stringifier ──────────────────────────────────────────
function parseToml(content) {
    const result = {};
    let currentSection = result;
    const lines = content.split("\n");
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const rawLine = lines[lineNum];
        const line = rawLine.replace(/#.*$/, "").trim();
        if (!line)
            continue;
        // Section header: [name]
        const sectionMatch = line.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
            const sectionName = sectionMatch[1].trim();
            const parts = sectionName.split(".");
            let obj = result;
            for (const part of parts) {
                if (!obj[part])
                    obj[part] = {};
                obj = obj[part];
            }
            currentSection = obj;
            continue;
        }
        // Key = value
        const eqIdx = line.indexOf("=");
        if (eqIdx === -1)
            continue;
        const key = line.slice(0, eqIdx).trim();
        const rawValue = line.slice(eqIdx + 1).trim();
        currentSection[key] = parseTomlValue(rawValue);
    }
    return result;
}
function parseTomlValue(raw) {
    raw = raw.trim();
    // Inline Table: { key = val, key2 = val2 }
    if (raw.startsWith("{") && raw.endsWith("}")) {
        const obj = {};
        const inner = raw.slice(1, -1).trim();
        if (!inner)
            return obj;
        const parts = inner.split(",");
        for (const part of parts) {
            const eqIdx = part.indexOf("=");
            if (eqIdx === -1)
                continue;
            const key = part.slice(0, eqIdx).trim();
            const val = part.slice(eqIdx + 1).trim();
            obj[key] = parseTomlValue(val);
        }
        return obj;
    }
    // String
    if (raw.startsWith('"') && raw.endsWith('"'))
        return raw.slice(1, -1);
    if (raw.startsWith("'") && raw.endsWith("'"))
        return raw.slice(1, -1);
    // Boolean
    if (raw === "true")
        return true;
    if (raw === "false")
        return false;
    // Number
    const num = Number(raw);
    if (!isNaN(num) && raw.length > 0)
        return num;
    // Array
    if (raw.startsWith("[") && raw.endsWith("]")) {
        const inner = raw.slice(1, -1).trim();
        if (!inner)
            return [];
        return inner.split(",").map((s) => parseTomlValue(s.trim()));
    }
    return raw;
}
function stringifyValue(val) {
    if (typeof val === "string")
        return `"${val}"`;
    if (typeof val === "boolean")
        return val ? "true" : "false";
    if (typeof val === "number")
        return String(val);
    if (typeof val === "object" && val !== null) {
        if (Array.isArray(val)) {
            return "[" + val.map(stringifyValue).join(", ") + "]";
        }
        const entries = Object.entries(val).map(([k, v]) => `${k} = ${stringifyValue(v)}`);
        return `{ ${entries.join(", ")} }`;
    }
    return `"${val}"`;
}
function stringifyToml(manifest) {
    const lines = [];
    lines.push("[package]");
    lines.push(`name = "${manifest.name}"`);
    lines.push(`version = "${manifest.version}"`);
    if (manifest.edition)
        lines.push(`edition = "${manifest.edition}"`);
    if (manifest.description)
        lines.push(`description = "${manifest.description}"`);
    if (manifest.author)
        lines.push(`author = "${manifest.author}"`);
    if (manifest.license)
        lines.push(`license = "${manifest.license}"`);
    if (manifest.main)
        lines.push(`main = "${manifest.main}"`);
    lines.push("");
    if (Object.keys(manifest.dependencies).length > 0) {
        lines.push("[dependencies]");
        for (const [pkg, ver] of Object.entries(manifest.dependencies)) {
            lines.push(`${pkg} = ${stringifyValue(ver)}`);
        }
        lines.push("");
    }
    if (Object.keys(manifest.devDependencies).length > 0) {
        lines.push("[devDependencies]");
        for (const [pkg, ver] of Object.entries(manifest.devDependencies)) {
            lines.push(`${pkg} = ${stringifyValue(ver)}`);
        }
        lines.push("");
    }
    return lines.join("\n");
}
// ─── Manifest I/O ─────────────────────────────────────────────────────────────
function readManifest(dir) {
    const manifestPath = path.join(dir, "hkd.toml");
    if (!fs.existsSync(manifestPath))
        return null;
    const content = fs.readFileSync(manifestPath, "utf-8");
    const raw = parseToml(content);
    const pkg = raw.package ?? raw;
    return {
        name: String(pkg.name ?? ""),
        version: String(pkg.version ?? "0.1.0"),
        edition: pkg.edition ? String(pkg.edition) : undefined,
        description: pkg.description ? String(pkg.description) : undefined,
        author: pkg.author ? String(pkg.author) : undefined,
        license: pkg.license ? String(pkg.license) : undefined,
        main: pkg.main ? String(pkg.main) : "src/main.hkd",
        dependencies: (raw.dependencies ?? {}),
        devDependencies: (raw.devDependencies ?? {}),
    };
}
function writeManifest(dir, manifest) {
    fs.mkdirSync(dir, { recursive: true });
    const manifestPath = path.join(dir, "hkd.toml");
    fs.writeFileSync(manifestPath, stringifyToml(manifest), "utf-8");
}
// ─── Packing & Unpacking ──────────────────────────────────────────────────────
function packPackage(dir) {
    const manifest = readManifest(dir);
    if (!manifest)
        throw new Error("No hkd.toml found to pack");
    const filesToPack = [];
    function scan(currentDir) {
        const list = fs.readdirSync(currentDir);
        for (const f of list) {
            const p = path.join(currentDir, f);
            const relPath = path.relative(dir, p).replace(/\\/g, "/");
            if (f === "node_modules" || f === ".git" || f === "target" || f === ".hkd" || f.endsWith(".hkdpack")) {
                continue;
            }
            const stat = fs.statSync(p);
            if (stat.isDirectory()) {
                scan(p);
            }
            else {
                filesToPack.push({
                    relPath,
                    content: fs.readFileSync(p)
                });
            }
        }
    }
    scan(dir);
    const parts = [];
    parts.push(Buffer.from("HKDPACK\n", "utf-8"));
    const manifestStr = JSON.stringify(manifest);
    const manifestBuf = Buffer.from(manifestStr, "utf-8");
    const manifestLenBuf = Buffer.alloc(4);
    manifestLenBuf.writeUInt32BE(manifestBuf.length, 0);
    parts.push(manifestLenBuf);
    parts.push(manifestBuf);
    const fileCountBuf = Buffer.alloc(4);
    fileCountBuf.writeUInt32BE(filesToPack.length, 0);
    parts.push(fileCountBuf);
    for (const file of filesToPack) {
        const pathBuf = Buffer.from(file.relPath, "utf-8");
        const pathLenBuf = Buffer.alloc(4);
        pathLenBuf.writeUInt32BE(pathBuf.length, 0);
        parts.push(pathLenBuf);
        parts.push(pathBuf);
        const contentLenBuf = Buffer.alloc(4);
        contentLenBuf.writeUInt32BE(file.content.length, 0);
        parts.push(contentLenBuf);
        parts.push(file.content);
    }
    return Buffer.concat(parts);
}
function unpackPackage(archiveBuf, targetDir) {
    let offset = 0;
    const header = archiveBuf.subarray(offset, offset + 8).toString("utf-8");
    if (header !== "HKDPACK\n")
        throw new Error("Invalid archive format: missing magic bytes");
    offset += 8;
    const manifestLen = archiveBuf.readUInt32BE(offset);
    offset += 4;
    const manifestStr = archiveBuf.subarray(offset, offset + manifestLen).toString("utf-8");
    offset += manifestLen;
    const manifest = JSON.parse(manifestStr);
    const fileCount = archiveBuf.readUInt32BE(offset);
    offset += 4;
    fs.mkdirSync(targetDir, { recursive: true });
    for (let i = 0; i < fileCount; i++) {
        const pathLen = archiveBuf.readUInt32BE(offset);
        offset += 4;
        const relPath = archiveBuf.subarray(offset, offset + pathLen).toString("utf-8");
        offset += pathLen;
        const resolvedPath = path.resolve(targetDir, relPath);
        if (!resolvedPath.startsWith(path.resolve(targetDir))) {
            throw new Error(`Security Violation: Path traversal attempt detected: ${relPath}`);
        }
        const contentLen = archiveBuf.readUInt32BE(offset);
        offset += 4;
        const content = archiveBuf.subarray(offset, offset + contentLen);
        offset += contentLen;
        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        fs.writeFileSync(resolvedPath, content);
    }
    return manifest;
}
// ─── Directory Copying Utility ────────────────────────────────────────────────
function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "target" || entry.name === ".hkd") {
            continue;
        }
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        }
        else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}
class PackageManager {
    cacheDir;
    constructor() {
        this.cacheDir = path.join(os.homedir(), ".hkd", "packages");
    }
    init(dir, name, template = "cli", edition = index_js_1.DEFAULT_EDITION) {
        const manifestPath = path.join(dir, "hkd.toml");
        if (fs.existsSync(manifestPath)) {
            return { ok: false, message: "hkd.toml already exists in this directory" };
        }
        const manifestName = name || path.basename(path.resolve(dir));
        const manifest = {
            ...DEFAULT_MANIFEST,
            name: manifestName,
            edition,
        };
        writeManifest(dir, manifest);
        // Create src/main.hkd
        const srcDir = path.join(dir, "src");
        fs.mkdirSync(srcDir, { recursive: true });
        const mainPath = path.join(srcDir, "main.hkd");
        if (!fs.existsSync(mainPath)) {
            let mainContent = "";
            if (template === "lib") {
                if (edition === "2027") {
                    mainContent = `export fn identity<T>(x: T) -> T {\n    return x\n}\n\nexport fn add(a: Int, b: Int) -> Int {\n    return a + b\n}\n\nexport fn sub(a: Int, b: Int) -> Int {\n    return a - b\n}\n`;
                }
                else {
                    mainContent = `export fn add(a: Int, b: Int) -> Int {\n    return a + b\n}\n\nexport fn sub(a: Int, b: Int) -> Int {\n    return a - b\n}\n`;
                }
            }
            else if (template === "server") {
                if (edition === "2027") {
                    mainContent = `import json\n\nstruct Request {\n    method: String\n    path: String\n}\n\nstruct Response {\n    status: Int\n    body: String\n}\n\nfn handle_request(req: Request) -> Response {\n    match req.path {\n        "/health" => Response { status: 200, body: "OK" },\n        "/api/data" => Response { status: 200, body: json.stringify({ status: "active", items: [1, 2, 3] }) },\n        _ => Response { status: 404, body: "Not Found" }\n    }\n}\n\nfn main() {\n    let req = Request { method: "GET", path: "/api/data" }\n    let res = handle_request(req)\n    print("Status: " + to_string(res.status))\n    print("Response: " + res.body)\n}\n\nmain()\n`;
                }
                else {
                    mainContent = `import json\n\nstruct Request {\n    method: String\n    path: String\n}\n\nstruct Response {\n    status: Int\n    body: String\n}\n\nfn handle_request(req: Request) -> Response {\n    if req.path == "/health" {\n        return Response { status: 200, body: "OK" }\n    }\n    if req.path == "/api/data" {\n        return Response { status: 200, body: json.stringify({ status: "active", items: [1, 2, 3] }) }\n    }\n    return Response { status: 404, body: "Not Found" }\n}\n\nfn main() {\n    let req = Request { method: "GET", path: "/api/data" }\n    let res = handle_request(req)\n    print("Status: " + to_string(res.status))\n    print("Response: " + res.body)\n}\n\nmain()\n`;
                }
            }
            else {
                // CLI or default
                if (edition === "2027") {
                    mainContent = `import env\n\nfn describe_arg(arg: String) -> String {\n    match arg {\n        "--help" => "Help flag requested",\n        "--version" => "Version flag requested",\n        _ => "Argument: " + arg\n    }\n}\n\nfn main() {\n    let args = env.args()\n    print("CLI arguments count:")\n    print(len(args))\n    if len(args) > 0 {\n        print(describe_arg(args[0]))\n    }\n}\n\nmain()\n`;
                }
                else {
                    mainContent = `import env\n\nfn main() {\n    let args = env.args()\n    print("CLI arguments count:")\n    print(len(args))\n    if len(args) > 0 {\n        print("First argument: " + args[0])\n    }\n}\n\nmain()\n`;
                }
            }
            fs.writeFileSync(mainPath, mainContent, "utf-8");
        }
        // Create tests/
        const testsDir = path.join(dir, "tests");
        fs.mkdirSync(testsDir, { recursive: true });
        const testPath = path.join(testsDir, "main.test.hkd");
        if (!fs.existsSync(testPath)) {
            let testContent = "";
            if (template === "lib") {
                if (edition === "2027") {
                    testContent = `import main from "../src/main.hkd"\n\ntest "addition works" {\n    assert(main.add(2, 3) == 5, "2 + 3 should be 5")\n}\n\ntest "generics work" {\n    assert(main.identity(42) == 42, "identity must preserve value")\n}\n`;
                }
                else {
                    testContent = `import main from "../src/main.hkd"\n\ntest "addition works" {\n    assert(main.add(2, 3) == 5, "2 + 3 should be 5")\n}\n`;
                }
            }
            else {
                if (edition === "2027") {
                    testContent = `test "basic match works" {\n    let val = 1\n    let res = match val {\n        1 => "one",\n        _ => "other"\n    }\n    assert(res == "one", "pattern matching must work in 2027")\n}\n`;
                }
                else {
                    testContent = `test "basic math works" {\n    assert(1 + 1 == 2, "1 + 1 must equal 2")\n}\n`;
                }
            }
            fs.writeFileSync(testPath, testContent, "utf-8");
        }
        // Create README.md
        const readmePath = path.join(dir, "README.md");
        if (!fs.existsSync(readmePath)) {
            fs.writeFileSync(readmePath, `# ${manifestName}\n\nAn HKD project (${template} template, edition ${edition}).\n`, "utf-8");
        }
        return { ok: true, message: `Created project ${manifestName} (${template} template, edition ${edition}) inside ${dir}` };
    }
    /** hkd pack — pack project to .hkdpack */
    pack(dir) {
        const manifest = readManifest(dir);
        if (!manifest)
            throw new Error("No hkd.toml found in directory to pack");
        const outName = `${manifest.name}-${manifest.version}.hkdpack`;
        const outPath = path.join(dir, outName);
        const buf = packPackage(dir);
        fs.writeFileSync(outPath, buf);
        return outPath;
    }
    /** hkd add <package> [version] */
    add(dir, pkgNameOrPath, version = "latest") {
        const manifest = readManifest(dir);
        if (!manifest) {
            return { ok: false, message: "No hkd.toml found. Run `hkd init` first." };
        }
        if (pkgNameOrPath.endsWith(".hkdpack") && fs.existsSync(pkgNameOrPath)) {
            try {
                const buf = fs.readFileSync(pkgNameOrPath);
                const checksum = crypto.createHash("sha256").update(buf).digest("hex");
                const tempDir = path.join(os.tmpdir(), `hkdpack-${Date.now()}`);
                const pkgManifest = unpackPackage(buf, tempDir);
                const cachePkgDir = path.join(this.cacheDir, pkgManifest.name, pkgManifest.version);
                if (fs.existsSync(cachePkgDir)) {
                    fs.rmSync(cachePkgDir, { recursive: true, force: true });
                }
                copyDirSync(tempDir, cachePkgDir);
                fs.rmSync(tempDir, { recursive: true, force: true });
                fs.writeFileSync(path.join(cachePkgDir, ".checksum"), checksum, "utf-8");
                manifest.dependencies[pkgManifest.name] = pkgManifest.version;
                writeManifest(dir, manifest);
                return { ok: true, message: `Added ${pkgManifest.name}@${pkgManifest.version} from archive to dependencies.` };
            }
            catch (err) {
                return { ok: false, message: `Failed to add package archive: ${err.message}` };
            }
        }
        else if (fs.existsSync(pkgNameOrPath) && fs.statSync(pkgNameOrPath).isDirectory()) {
            try {
                const pkgManifest = readManifest(pkgNameOrPath);
                if (!pkgManifest) {
                    return { ok: false, message: `No hkd.toml found in directory: ${pkgNameOrPath}` };
                }
                const relPath = path.relative(dir, pkgNameOrPath).replace(/\\/g, "/");
                manifest.dependencies[pkgManifest.name] = { path: relPath };
                writeManifest(dir, manifest);
                return { ok: true, message: `Added path dependency ${pkgManifest.name} -> ${relPath} to dependencies.` };
            }
            catch (err) {
                return { ok: false, message: `Failed to add directory dependency: ${err.message}` };
            }
        }
        else {
            manifest.dependencies[pkgNameOrPath] = version;
            writeManifest(dir, manifest);
            return { ok: true, message: `Added dependency ${pkgNameOrPath}@${version} to dependencies.` };
        }
    }
    /** hkd remove <package> */
    remove(dir, pkgName) {
        const manifest = readManifest(dir);
        if (!manifest) {
            return { ok: false, message: "No hkd.toml found." };
        }
        if (!(pkgName in manifest.dependencies) && !(pkgName in manifest.devDependencies)) {
            return { ok: false, message: `Package \`${pkgName}\` is not in dependencies.` };
        }
        delete manifest.dependencies[pkgName];
        delete manifest.devDependencies[pkgName];
        writeManifest(dir, manifest);
        return { ok: true, message: `Removed ${pkgName} from dependencies.` };
    }
    /** hkd install — resolve and download all dependencies */
    install(dir) {
        const manifest = readManifest(dir);
        if (!manifest) {
            return { ok: false, message: "No hkd.toml found. Run `hkd init` first." };
        }
        try {
            // 1. Resolve full transitive dependency graph with circular detection
            const resolved = resolveDependencies(dir, manifest, this.cacheDir);
            // 2. Write lockfile
            const lockPath = path.join(dir, "hkd.lock");
            const packages = Object.values(resolved).sort((a, b) => a.name.localeCompare(b.name));
            fs.writeFileSync(lockPath, JSON.stringify({ packages }, null, 2), "utf-8");
            // 3. Clear and reconstruct local .hkd/deps folder
            const depsDir = path.join(dir, ".hkd", "deps");
            if (fs.existsSync(depsDir)) {
                fs.rmSync(depsDir, { recursive: true, force: true });
            }
            fs.mkdirSync(depsDir, { recursive: true });
            const messages = [];
            for (const dep of Object.values(resolved)) {
                let srcDir = "";
                if ("path" in dep.source) {
                    srcDir = path.resolve(dir, dep.source.path);
                }
                else {
                    srcDir = path.join(this.cacheDir, dep.name, dep.version);
                }
                const destDir = path.join(depsDir, dep.name);
                copyDirSync(srcDir, destDir);
                messages.push(`  ✓ ${dep.name}@${dep.version} resolved`);
            }
            return {
                ok: true,
                message: `Installed dependencies successfully:\n${messages.join("\n")}`,
            };
        }
        catch (err) {
            return { ok: false, message: `Installation failed: ${err.message}` };
        }
    }
    /** hkd update — update lockfile and dependencies */
    update(dir) {
        return this.install(dir);
    }
    /** Resolve a package to its directory */
    resolve(fromDir, name) {
        // Look up in .hkd/deps folder climbing up to project root
        let cur = fromDir;
        while (true) {
            const depDir = path.join(cur, ".hkd", "deps", name);
            if (fs.existsSync(depDir)) {
                return depDir;
            }
            const parent = path.dirname(cur);
            if (parent === cur)
                break;
            cur = parent;
        }
        return null;
    }
}
exports.PackageManager = PackageManager;
function resolveDependencies(dir, manifest, cacheDir, activeResolutions = new Set()) {
    const resolved = {};
    const deps = { ...manifest.dependencies, ...manifest.devDependencies };
    for (const [name, depVal] of Object.entries(deps)) {
        if (activeResolutions.has(name)) {
            throw new Error(`Circular dependency detected: ${Array.from(activeResolutions).join(" -> ")} -> ${name}`);
        }
        activeResolutions.add(name);
        let depDir = "";
        let source = { cached: true };
        let depManifest = null;
        if (typeof depVal === "object" && depVal !== null && "path" in depVal) {
            depDir = path.resolve(dir, depVal.path);
            source = { path: depVal.path };
            depManifest = readManifest(depDir);
            if (!depManifest) {
                throw new Error(`Path dependency not found: no hkd.toml in ${depDir}`);
            }
        }
        else {
            const version = String(depVal);
            depDir = path.join(cacheDir, name, version);
            if (!fs.existsSync(depDir)) {
                throw new Error(`Package ${name}@${version} not found in cache. Add it first via a .hkdpack file.`);
            }
            depManifest = readManifest(depDir);
            if (!depManifest) {
                throw new Error(`Cached package ${name}@${version} is corrupt: missing hkd.toml`);
            }
            const checksumFile = path.join(depDir, ".checksum");
            const checksum = fs.existsSync(checksumFile) ? fs.readFileSync(checksumFile, "utf-8") : "local-cached";
            source = { checksum };
        }
        const childResolved = resolveDependencies(depDir, depManifest, cacheDir, activeResolutions);
        Object.assign(resolved, childResolved);
        resolved[name] = {
            name: depManifest.name,
            version: depManifest.version,
            source,
            dependencies: Object.fromEntries(Object.entries({ ...depManifest.dependencies, ...depManifest.devDependencies }).map(([k, v]) => [
                k,
                typeof v === "object" && v !== null && "path" in v ? `path:${v.path}` : String(v)
            ]))
        };
        activeResolutions.delete(name);
    }
    return resolved;
}
//# sourceMappingURL=index.js.map