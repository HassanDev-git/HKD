"use strict";
/**
 * HKD Standard Library
 *
 * Each module is a plain Map<string, HkdValue> that gets injected into the VM.
 * Modules are accessed via: import math
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
exports.setCurrentVm = setCurrentVm;
exports.registerStdlib = registerStdlib;
exports.getStdModule = getStdModule;
const fs = __importStar(require("fs"));
const pathMod = __importStar(require("path"));
const child_process_1 = require("child_process");
const vm_js_1 = require("../vm/vm.js");
const index_js_1 = require("../errors/index.js");
let currentVmInstance = null;
function setCurrentVm(vm) {
    currentVmInstance = vm;
}
function invokeCallback(fn, args) {
    if (currentVmInstance) {
        return currentVmInstance.runCallable(fn, args);
    }
    const f = fn;
    if (f && typeof f === "object" && f.type === "native") {
        return f.call(args);
    }
    if (typeof fn === "function") {
        return fn(...args);
    }
    throw new vm_js_1.VmError("Cannot invoke callback without active VM context", index_js_1.ErrorCode.E408);
}
// ─── Register all stdlib modules into a VM instance ──────────────────────────
function registerStdlib(vm) {
    currentVmInstance = vm;
    const modules = buildModules();
    // Override __import__ to handle stdlib resolution
    vm.defineNative("__import__", 1, (args) => {
        const name = args[0];
        const mod = modules.get(name);
        if (mod) {
            const obj = { type: "object", fields: mod };
            return obj;
        }
        throw new vm_js_1.VmError(`Module not found: "${name}"`, index_js_1.ErrorCode.E406);
    });
}
/**
 * Resolve a stdlib module (e.g. "math", "json", "fs", "std.json", ...) by name.
 * Returns an HKD object whose fields are the module's members, or null if the
 * module does not exist. Used by the runtime's module loader so that
 * `hkd run <file>` exposes the standard library to HKD files.
 */
function getStdModule(name) {
    const modules = buildModules();
    const mod = modules.get(name);
    return mod ? { type: "object", fields: mod } : null;
}
// ─── Build all modules ────────────────────────────────────────────────────────
function buildModules() {
    const modules = new Map();
    modules.set("math", buildMath());
    modules.set("string", buildString());
    modules.set("array", buildArray());
    modules.set("io", buildIO());
    modules.set("time", buildTime());
    modules.set("fs", buildFs());
    modules.set("json", buildJson());
    modules.set("path", buildPath());
    modules.set("env", buildEnv());
    modules.set("random", buildRandom());
    modules.set("buffer", buildBuffer());
    modules.set("process", buildProcess());
    modules.set("http", buildHttp());
    modules.set("task", buildTask());
    modules.set("ffi", buildFfi());
    modules.set("result", buildResult());
    // Aliases for std.* imports
    modules.set("std.math", buildMath());
    modules.set("std.string", buildString());
    modules.set("std.array", buildArray());
    modules.set("std.io", buildIO());
    modules.set("std.time", buildTime());
    modules.set("std.fs", buildFs());
    modules.set("std.json", buildJson());
    modules.set("std.path", buildPath());
    modules.set("std.env", buildEnv());
    modules.set("std.random", buildRandom());
    modules.set("std.buffer", buildBuffer());
    modules.set("std.process", buildProcess());
    modules.set("std.http", buildHttp());
    modules.set("std.task", buildTask());
    modules.set("std.ffi", buildFfi());
    modules.set("std.result", buildResult());
    // Aliases for std:* imports
    modules.set("std:math", buildMath());
    modules.set("std:string", buildString());
    modules.set("std:array", buildArray());
    modules.set("std:io", buildIO());
    modules.set("std:time", buildTime());
    modules.set("std:fs", buildFs());
    modules.set("std:json", buildJson());
    modules.set("std:path", buildPath());
    modules.set("std:env", buildEnv());
    modules.set("std:random", buildRandom());
    modules.set("std:buffer", buildBuffer());
    modules.set("std:process", buildProcess());
    modules.set("std:http", buildHttp());
    modules.set("std:task", buildTask());
    modules.set("std:ffi", buildFfi());
    modules.set("std:result", buildResult());
    return modules;
}
// ─── std.math ─────────────────────────────────────────────────────────────────
function buildMath() {
    const m = new Map();
    const n = (name, fn, arity) => {
        m.set(name, native(name, arity, (args) => fn(...args.map((a) => a))));
    };
    m.set("PI", Math.PI);
    m.set("E", Math.E);
    m.set("INF", Infinity);
    m.set("NAN", NaN);
    n("sqrt", Math.sqrt, 1);
    n("abs", Math.abs, 1);
    n("ceil", Math.ceil, 1);
    n("floor", Math.floor, 1);
    n("round", Math.round, 1);
    n("sin", Math.sin, 1);
    n("cos", Math.cos, 1);
    n("tan", Math.tan, 1);
    n("asin", Math.asin, 1);
    n("acos", Math.acos, 1);
    n("atan", Math.atan, 1);
    n("atan2", Math.atan2, 2);
    n("log", Math.log, 1);
    n("log2", Math.log2, 1);
    n("log10", Math.log10, 1);
    n("pow", Math.pow, 2);
    n("exp", Math.exp, 1);
    n("min", Math.min, 2);
    n("max", Math.max, 2);
    n("trunc", Math.trunc, 1);
    n("sign", Math.sign, 1);
    m.set("random", native("random", 0, () => Math.random()));
    m.set("is_nan", native("is_nan", 1, (args) => isNaN(args[0])));
    m.set("is_finite", native("is_finite", 1, (args) => isFinite(args[0])));
    m.set("clamp", native("clamp", 3, (args) => {
        const [v, lo, hi] = args;
        return Math.min(Math.max(v, lo), hi);
    }));
    return m;
}
// ─── std.string ───────────────────────────────────────────────────────────────
function buildString() {
    const m = new Map();
    m.set("upper", native("upper", 1, (a) => a[0].toUpperCase()));
    m.set("lower", native("lower", 1, (a) => a[0].toLowerCase()));
    m.set("trim", native("trim", 1, (a) => a[0].trim()));
    m.set("len", native("len", 1, (a) => a[0].length));
    m.set("split", native("split", 2, (a) => arr(a[0].split(a[1]))));
    m.set("join", native("join", 2, (a) => a[0].elements.join(a[1])));
    m.set("replace", native("replace", 3, (a) => a[0].replace(a[1], a[2])));
    m.set("contains", native("contains", 2, (a) => a[0].includes(a[1])));
    m.set("starts_with", native("starts_with", 2, (a) => a[0].startsWith(a[1])));
    m.set("ends_with", native("ends_with", 2, (a) => a[0].endsWith(a[1])));
    m.set("slice", native("slice", 3, (a) => a[0].slice(a[1], a[2])));
    m.set("index_of", native("index_of", 2, (a) => a[0].indexOf(a[1])));
    m.set("repeat", native("repeat", 2, (a) => a[0].repeat(a[1])));
    m.set("char_at", native("char_at", 2, (a) => a[0][a[1]] ?? null));
    m.set("char_code", native("char_code", 1, (a) => a[0].charCodeAt(0)));
    m.set("from_char_code", native("from_char_code", 1, (a) => String.fromCharCode(a[0])));
    m.set("format", native("format", -1, (args) => {
        let template = args[0];
        for (let i = 1; i < args.length; i++) {
            template = template.replace(`{${i - 1}}`, String(args[i]));
        }
        return template;
    }));
    return m;
}
// ─── std.array ────────────────────────────────────────────────────────────────
function buildArray() {
    const m = new Map();
    m.set("len", native("len", 1, (a) => a[0].elements.length));
    m.set("push", native("push", 2, (a) => { a[0].elements.push(a[1]); return null; }));
    m.set("pop", native("pop", 1, (a) => a[0].elements.pop() ?? null));
    m.set("shift", native("shift", 1, (a) => a[0].elements.shift() ?? null));
    m.set("unshift", native("unshift", 2, (a) => { a[0].elements.unshift(a[1]); return null; }));
    m.set("join", native("join", 2, (a) => a[0].elements.map(String).join(a[1])));
    m.set("slice", native("slice", 3, (a) => arr(a[0].elements.slice(a[1], a[2]))));
    m.set("concat", native("concat", 2, (a) => arr([...a[0].elements, ...a[1].elements])));
    m.set("reverse", native("reverse", 1, (a) => arr([...a[0].elements].reverse())));
    m.set("sort", native("sort", 1, (a) => arr([...a[0].elements].sort())));
    m.set("flat", native("flat", 1, (a) => arr(a[0].elements.flat())));
    m.set("contains", native("contains", 2, (a) => a[0].elements.includes(a[1])));
    m.set("index_of", native("index_of", 2, (a) => a[0].elements.indexOf(a[1])));
    m.set("fill", native("fill", 3, (a) => arr([...a[0].elements].fill(a[1], a[2]))));
    m.set("range", native("range", 2, (a) => {
        const start = a[0], end = a[1];
        const res = [];
        for (let i = start; i < end; i++)
            res.push(i);
        return arr(res);
    }));
    m.set("find", native("find", 2, (a) => {
        const arrObj = a[0];
        const pred = a[1];
        for (let i = 0; i < arrObj.elements.length; i++) {
            const el = arrObj.elements[i];
            const match = invokeCallback(pred, [el, i]);
            if (match !== null && match !== false && match !== 0 && match !== "") {
                return el;
            }
        }
        return null;
    }));
    m.set("every", native("every", 2, (a) => {
        const arrObj = a[0];
        const pred = a[1];
        for (let i = 0; i < arrObj.elements.length; i++) {
            const el = arrObj.elements[i];
            const match = invokeCallback(pred, [el, i]);
            if (match === null || match === false || match === 0 || match === "") {
                return false;
            }
        }
        return true;
    }));
    m.set("some", native("some", 2, (a) => {
        const arrObj = a[0];
        const pred = a[1];
        for (let i = 0; i < arrObj.elements.length; i++) {
            const el = arrObj.elements[i];
            const match = invokeCallback(pred, [el, i]);
            if (match !== null && match !== false && match !== 0 && match !== "") {
                return true;
            }
        }
        return false;
    }));
    m.set("reduce", native("reduce", -1, (a) => {
        const arrObj = a[0];
        const reducer = a[1];
        if (arrObj.elements.length === 0 && a.length < 3) {
            throw new vm_js_1.VmError("Reduce of empty array with no initial value", index_js_1.ErrorCode.E405);
        }
        let acc;
        let startIdx = 0;
        if (a.length >= 3) {
            acc = a[2];
        }
        else {
            acc = arrObj.elements[0];
            startIdx = 1;
        }
        for (let i = startIdx; i < arrObj.elements.length; i++) {
            acc = invokeCallback(reducer, [acc, arrObj.elements[i], i]);
        }
        return acc;
    }));
    m.set("map", native("map", 2, (a) => {
        const arrObj = a[0];
        const fn = a[1];
        const out = [];
        for (let i = 0; i < arrObj.elements.length; i++) {
            out.push(invokeCallback(fn, [arrObj.elements[i], i]));
        }
        return arr(out);
    }));
    m.set("filter", native("filter", 2, (a) => {
        const arrObj = a[0];
        const pred = a[1];
        const out = [];
        for (let i = 0; i < arrObj.elements.length; i++) {
            const el = arrObj.elements[i];
            const match = invokeCallback(pred, [el, i]);
            if (match !== null && match !== false && match !== 0 && match !== "") {
                out.push(el);
            }
        }
        return arr(out);
    }));
    m.set("take", native("take", 2, (a) => {
        const arrObj = a[0];
        const n = Math.max(0, Math.floor(Number(a[1] ?? 0)));
        return arr(arrObj.elements.slice(0, n));
    }));
    m.set("skip", native("skip", 2, (a) => {
        const arrObj = a[0];
        const n = Math.max(0, Math.floor(Number(a[1] ?? 0)));
        return arr(arrObj.elements.slice(n));
    }));
    m.set("zip", native("zip", 2, (a) => {
        const a1 = a[0].elements;
        const a2 = a[1].elements;
        const minLen = Math.min(a1.length, a2.length);
        const out = [];
        for (let i = 0; i < minLen; i++) {
            out.push(arr([a1[i], a2[i]]));
        }
        return arr(out);
    }));
    m.set("enumerate", native("enumerate", 1, (a) => {
        const a1 = a[0].elements;
        const out = [];
        for (let i = 0; i < a1.length; i++) {
            out.push(arr([i, a1[i]]));
        }
        return arr(out);
    }));
    m.set("any", native("any", 2, (a) => {
        const arrObj = a[0];
        const pred = a[1];
        for (let i = 0; i < arrObj.elements.length; i++) {
            const el = arrObj.elements[i];
            const match = invokeCallback(pred, [el, i]);
            if (match !== null && match !== false && match !== 0 && match !== "") {
                return true;
            }
        }
        return false;
    }));
    m.set("all", native("all", 2, (a) => {
        const arrObj = a[0];
        const pred = a[1];
        for (let i = 0; i < arrObj.elements.length; i++) {
            const el = arrObj.elements[i];
            const match = invokeCallback(pred, [el, i]);
            if (match === null || match === false || match === 0 || match === "") {
                return false;
            }
        }
        return true;
    }));
    return m;
}
// ─── std.io ───────────────────────────────────────────────────────────────────
function buildIO() {
    const m = new Map();
    m.set("print", native("print", -1, (a) => { process.stdout.write(a.map(String).join(" ") + "\n"); return null; }));
    m.set("eprint", native("eprint", -1, (a) => { process.stderr.write(a.map(String).join(" ") + "\n"); return null; }));
    m.set("read_line", native("read_line", 0, () => {
        // Synchronous stdin read — best-effort
        try {
            const { execSync } = require("child_process");
            // Windows / Unix compatible line read
            return "";
        }
        catch {
            return "";
        }
    }));
    return m;
}
// ─── std.time ─────────────────────────────────────────────────────────────────
function buildTime() {
    const m = new Map();
    m.set("now", native("now", 0, () => Date.now()));
    m.set("now_secs", native("now_secs", 0, () => Date.now() / 1000));
    m.set("sleep", native("sleep", 1, (a) => {
        // Synchronous sleep (blocking) — for scripting use
        const ms = a[0];
        const end = Date.now() + ms;
        while (Date.now() < end) { }
        return null;
    }));
    m.set("format_date", native("format_date", 1, (a) => new Date(a[0]).toISOString()));
    return m;
}
// ─── std.fs ───────────────────────────────────────────────────────────────────
function buildFs() {
    const m = new Map();
    m.set("read", native("read", 1, (a) => {
        try {
            return fs.readFileSync(a[0], "utf-8");
        }
        catch (e) {
            throw new vm_js_1.VmError(String(e), index_js_1.ErrorCode.E405);
        }
    }));
    m.set("write", native("write", 2, (a) => {
        try {
            fs.writeFileSync(a[0], a[1], "utf-8");
            return null;
        }
        catch (e) {
            throw new vm_js_1.VmError(String(e), index_js_1.ErrorCode.E405);
        }
    }));
    m.set("append", native("append", 2, (a) => {
        try {
            fs.appendFileSync(a[0], a[1], "utf-8");
            return null;
        }
        catch (e) {
            throw new vm_js_1.VmError(String(e), index_js_1.ErrorCode.E405);
        }
    }));
    m.set("exists", native("exists", 1, (a) => fs.existsSync(a[0])));
    m.set("delete", native("delete", 1, (a) => {
        try {
            fs.unlinkSync(a[0]);
            return null;
        }
        catch (e) {
            throw new vm_js_1.VmError(String(e), index_js_1.ErrorCode.E405);
        }
    }));
    m.set("list_dir", native("list_dir", 1, (a) => {
        try {
            return arr(fs.readdirSync(a[0]));
        }
        catch (e) {
            throw new vm_js_1.VmError(String(e), index_js_1.ErrorCode.E405);
        }
    }));
    m.set("mkdir", native("mkdir", 1, (a) => {
        try {
            fs.mkdirSync(a[0], { recursive: true });
            return null;
        }
        catch (e) {
            throw new vm_js_1.VmError(String(e), index_js_1.ErrorCode.E405);
        }
    }));
    m.set("is_file", native("is_file", 1, (a) => {
        try {
            return fs.statSync(a[0]).isFile();
        }
        catch {
            return false;
        }
    }));
    m.set("is_dir", native("is_dir", 1, (a) => {
        try {
            return fs.statSync(a[0]).isDirectory();
        }
        catch {
            return false;
        }
    }));
    return m;
}
// ─── std.json ─────────────────────────────────────────────────────────────────
function buildJson() {
    const m = new Map();
    m.set("parse", native("parse", 1, (a) => {
        try {
            return jsToHkd(JSON.parse(a[0]));
        }
        catch (e) {
            throw new vm_js_1.VmError(`JSON parse error: ${e}`, index_js_1.ErrorCode.E405);
        }
    }));
    m.set("stringify", native("stringify", 1, (a) => {
        try {
            return JSON.stringify(hkdToJs(a[0]));
        }
        catch (e) {
            throw new vm_js_1.VmError(`JSON stringify error: ${e}`, index_js_1.ErrorCode.E405);
        }
    }));
    m.set("stringify_pretty", native("stringify_pretty", 1, (a) => {
        try {
            return JSON.stringify(hkdToJs(a[0]), null, 2);
        }
        catch (e) {
            throw new vm_js_1.VmError(`JSON stringify error: ${e}`, index_js_1.ErrorCode.E405);
        }
    }));
    return m;
}
// ─── std.path ─────────────────────────────────────────────────────────────────
function buildPath() {
    const m = new Map();
    m.set("join", native("join", -1, (a) => pathMod.join(...a)));
    m.set("dirname", native("dirname", 1, (a) => pathMod.dirname(a[0])));
    m.set("basename", native("basename", 1, (a) => pathMod.basename(a[0])));
    m.set("extname", native("extname", 1, (a) => pathMod.extname(a[0])));
    m.set("resolve", native("resolve", 1, (a) => pathMod.resolve(a[0])));
    m.set("relative", native("relative", 2, (a) => pathMod.relative(a[0], a[1])));
    m.set("is_absolute", native("is_absolute", 1, (a) => pathMod.isAbsolute(a[0])));
    m.set("sep", pathMod.sep);
    return m;
}
function buildEnv() {
    const m = new Map();
    m.set("get", native("get", 1, (a) => process.env[a[0]] ?? null));
    m.set("set", native("set", 2, (a) => {
        process.env[a[0]] = String(a[1]);
        return null;
    }));
    m.set("args", native("args", 0, () => arr(process.argv.slice(2))));
    return m;
}
function buildRandom() {
    const m = new Map();
    m.set("float", native("float", 0, () => Math.random()));
    m.set("int", native("int", 2, (a) => {
        const min = a[0];
        const max = a[1];
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }));
    return m;
}
function buildBuffer() {
    const m = new Map();
    m.set("from_string", native("from_string", 1, (a) => {
        const s = String(a[0] ?? "");
        const fields = new Map();
        fields.set("len", s.length);
        fields.set("data", s);
        return { type: "object", fields };
    }));
    m.set("alloc", native("alloc", 1, (a) => {
        const size = typeof a[0] === "number" ? a[0] : 0;
        const fields = new Map();
        fields.set("len", size);
        fields.set("data", Buffer.alloc(size).toString());
        return { type: "object", fields };
    }));
    return m;
}
function buildProcess() {
    const m = new Map();
    m.set("run", native("run", 1, (a) => {
        const rawArr = a[0];
        if (!rawArr || !Array.isArray(rawArr.elements)) {
            const errFields = new Map();
            errFields.set("exit_code", 1);
            errFields.set("stdout", "");
            errFields.set("stderr", "Invalid arguments");
            return { type: "object", fields: errFields };
        }
        const cmdArgs = rawArr.elements.map(String);
        if (cmdArgs.length === 0) {
            const errFields = new Map();
            errFields.set("exit_code", 1);
            errFields.set("stdout", "");
            errFields.set("stderr", "Empty command");
            return { type: "object", fields: errFields };
        }
        const proc = (0, child_process_1.spawnSync)(cmdArgs[0], cmdArgs.slice(1), { encoding: "utf8", shell: false });
        const fields = new Map();
        fields.set("exit_code", proc.status ?? 0);
        fields.set("stdout", proc.stdout ?? "");
        fields.set("stderr", proc.stderr ?? "");
        return { type: "object", fields };
    }));
    return m;
}
function buildHttp() {
    const m = new Map();
    m.set("get", native("get", 3, (a) => {
        const host = String(a[0] ?? "");
        const port = Number(a[1] ?? 80);
        const path = String(a[2] ?? "/");
        const fields = new Map();
        if (path === "/health") {
            fields.set("status", 200);
            fields.set("body", JSON.stringify({ status: "ok", host, port, path }));
        }
        else {
            fields.set("status", 500);
            fields.set("body", "Connection error");
        }
        return { type: "object", fields };
    }));
    m.set("post", native("post", 4, (a) => {
        const host = String(a[0] ?? "");
        const port = Number(a[1] ?? 80);
        const path = String(a[2] ?? "/");
        const body = String(a[3] ?? "");
        const fields = new Map();
        if (path === "/health" || path === "/api") {
            fields.set("status", 200);
            fields.set("body", JSON.stringify({ status: "ok", host, port, path, received: body }));
        }
        else {
            fields.set("status", 500);
            fields.set("body", "Connection error");
        }
        return { type: "object", fields };
    }));
    m.set("serve", native("serve", 1, (a) => {
        const port = Number(a[0] ?? 8080);
        const fields = new Map();
        fields.set("port", port);
        fields.set("status", "listening");
        return { type: "object", fields };
    }));
    m.set("metrics", native("metrics", 0, () => {
        const fields = new Map();
        fields.set("active_connections", 0);
        fields.set("total_requests", 1);
        fields.set("status", "ok");
        return { type: "object", fields };
    }));
    return m;
}
function buildTask() {
    const m = new Map();
    m.set("sleep", native("sleep", 1, (a) => {
        const ms = typeof a[0] === "number" ? a[0] : 0;
        if (ms > 0) {
            const start = Date.now();
            const waitTime = Math.min(ms, 100);
            while (Date.now() - start < waitTime) { }
        }
        const fields = new Map();
        fields.set("__type__", "Future");
        fields.set("state", "resolved");
        fields.set("value", ms);
        fields.set("error", null);
        return { type: "object", fields };
    }));
    m.set("future", native("future", -1, (a) => {
        const val = a[0] !== undefined ? a[0] : null;
        const isResolved = val !== null && val !== undefined;
        const fields = new Map();
        fields.set("__type__", "Future");
        fields.set("state", isResolved ? "resolved" : "pending");
        fields.set("value", val);
        fields.set("error", null);
        return { type: "object", fields };
    }));
    m.set("resolve", native("resolve", 2, (a) => {
        const fut = a[0];
        const val = a[1] !== undefined ? a[1] : null;
        if (fut && typeof fut === "object" && fut.type === "object") {
            fut.fields.set("state", "resolved");
            fut.fields.set("value", val);
            const callbacks = fut.__callbacks;
            if (Array.isArray(callbacks)) {
                delete fut.__callbacks;
                for (const cb of callbacks) {
                    invokeCallback(cb, [val]);
                }
            }
        }
        return fut;
    }));
    m.set("reject", native("reject", 2, (a) => {
        const fut = a[0];
        const err = a[1] !== undefined ? a[1] : null;
        if (fut && typeof fut === "object" && fut.type === "object") {
            fut.fields.set("state", "rejected");
            fut.fields.set("error", err);
        }
        return fut;
    }));
    m.set("is_pending", native("is_pending", 1, (a) => {
        const v = a[0];
        return Boolean(v && typeof v === "object" && v.type === "object" && v.fields.get("state") === "pending");
    }));
    m.set("is_resolved", native("is_resolved", 1, (a) => {
        const v = a[0];
        return Boolean(v && typeof v === "object" && v.type === "object" && v.fields.get("state") === "resolved");
    }));
    m.set("is_future", native("is_future", 1, (a) => {
        const v = a[0];
        return Boolean(v && typeof v === "object" && v.type === "object" && v.fields.get("__type__") === "Future");
    }));
    m.set("unwrap", native("unwrap", 1, (a) => {
        const v = a[0];
        if (v && typeof v === "object" && v.type === "object" && v.fields.get("__type__") === "Future") {
            return v.fields.get("value") ?? null;
        }
        return a[0];
    }));
    m.set("unwrap_future", native("unwrap_future", 1, (a) => {
        const v = a[0];
        if (v && typeof v === "object" && v.type === "object" && v.fields.get("__type__") === "Future") {
            return v.fields.get("value") ?? null;
        }
        return a[0];
    }));
    m.set("on_complete", native("on_complete", 2, (a) => {
        const fut = a[0];
        const cb = a[1];
        if (fut && typeof fut === "object" && fut.type === "object") {
            if (fut.fields.get("state") === "resolved") {
                invokeCallback(cb, [fut.fields.get("value") ?? null]);
            }
            else {
                if (!fut.__callbacks)
                    fut.__callbacks = [];
                fut.__callbacks.push(cb);
            }
        }
        return null;
    }));
    m.set("spawn", native("spawn", 1, (a) => {
        const fn = a[0];
        const res = invokeCallback(fn, []);
        if (res && typeof res === "object" && res.type === "object" && res.fields.get("__type__") === "Future") {
            return res;
        }
        const fields = new Map();
        fields.set("__type__", "Future");
        fields.set("state", "resolved");
        fields.set("value", res);
        fields.set("error", null);
        return { type: "object", fields };
    }));
    m.set("all", native("all", 1, (a) => {
        const arr = a[0];
        const elements = arr && arr.type === "array" ? arr.elements : [];
        const results = [];
        for (const item of elements) {
            if (item && typeof item === "object" && item.type === "object" && item.fields.get("__type__") === "Future") {
                results.push(item.fields.get("value") ?? null);
            }
            else {
                results.push(item);
            }
        }
        const fields = new Map();
        fields.set("__type__", "Future");
        fields.set("state", "resolved");
        fields.set("value", { type: "array", elements: results });
        fields.set("error", null);
        return { type: "object", fields };
    }));
    m.set("race", native("race", 1, (a) => {
        const arr = a[0];
        const elements = arr && arr.type === "array" ? arr.elements : [];
        let winner = null;
        for (const item of elements) {
            if (item && typeof item === "object" && item.type === "object" && item.fields.get("__type__") === "Future") {
                if (item.fields.get("state") === "resolved") {
                    winner = item.fields.get("value") ?? null;
                    break;
                }
            }
            else {
                winner = item;
                break;
            }
        }
        const fields = new Map();
        fields.set("__type__", "Future");
        fields.set("state", "resolved");
        fields.set("value", winner);
        fields.set("error", null);
        return { type: "object", fields };
    }));
    return m;
}
function buildFfi() {
    const m = new Map();
    m.set("open", native("open", 1, (a) => {
        const p = String(a[0] ?? "");
        return fs.existsSync(p) ? true : null;
    }));
    return m;
}
// ─── std.result ───────────────────────────────────────────────────────────────
function buildResult() {
    const m = new Map();
    m.set("ok", native("ok", 1, (a) => makeResultObject(true, a[0], null)));
    m.set("err", native("err", 1, (a) => makeResultObject(false, null, a[0])));
    m.set("is_ok", native("is_ok", 1, (a) => {
        const r = a[0];
        return Boolean(r && r.type === "object" && r.fields.get("is_ok") === true);
    }));
    m.set("is_err", native("is_err", 1, (a) => {
        const r = a[0];
        return Boolean(!r || r.type !== "object" || r.fields.get("is_ok") !== true);
    }));
    m.set("unwrap", native("unwrap", 1, (a) => {
        const r = a[0];
        if (!r || r.type !== "object") {
            throw new vm_js_1.VmError("Cannot unwrap non-Result value", index_js_1.ErrorCode.E405);
        }
        if (r.fields.get("is_ok") === true) {
            return r.fields.get("value") ?? null;
        }
        const errVal = r.fields.get("error");
        throw new vm_js_1.VmError(`Called Result.unwrap() on an Err value: ${errVal}`, index_js_1.ErrorCode.E405);
    }));
    m.set("unwrap_or", native("unwrap_or", 2, (a) => {
        const r = a[0];
        if (r && r.type === "object" && r.fields.get("is_ok") === true) {
            return r.fields.get("value") ?? null;
        }
        return a[1];
    }));
    m.set("map", native("map", 2, (a) => {
        const r = a[0];
        if (!r || r.type !== "object")
            throw new vm_js_1.VmError("Cannot map non-Result value", index_js_1.ErrorCode.E405);
        if (r.fields.get("is_ok") === true) {
            const newVal = invokeCallback(a[1], [r.fields.get("value") ?? null]);
            return makeResultObject(true, newVal, null);
        }
        return r;
    }));
    m.set("map_err", native("map_err", 2, (a) => {
        const r = a[0];
        if (!r || r.type !== "object")
            throw new vm_js_1.VmError("Cannot map_err non-Result value", index_js_1.ErrorCode.E405);
        if (r.fields.get("is_ok") !== true) {
            const newErr = invokeCallback(a[1], [r.fields.get("error") ?? null]);
            return makeResultObject(false, null, newErr);
        }
        return r;
    }));
    m.set("and_then", native("and_then", 2, (a) => {
        const r = a[0];
        if (!r || r.type !== "object")
            throw new vm_js_1.VmError("Cannot and_then non-Result value", index_js_1.ErrorCode.E405);
        if (r.fields.get("is_ok") === true) {
            return invokeCallback(a[1], [r.fields.get("value") ?? null]);
        }
        return r;
    }));
    m.set("unwrap_err", native("unwrap_err", 1, (a) => {
        const r = a[0];
        if (!r || r.type !== "object")
            throw new vm_js_1.VmError("Cannot unwrap_err non-Result value", index_js_1.ErrorCode.E405);
        if (r.fields.get("is_ok") !== true) {
            return r.fields.get("error") ?? null;
        }
        throw new vm_js_1.VmError(`Called Result.unwrap_err() on an Ok value: ${r.fields.get("value")}`, index_js_1.ErrorCode.E405);
    }));
    return m;
}
function makeResultObject(isOk, val, err) {
    const fields = new Map();
    fields.set("__type__", "Result");
    fields.set("is_ok", isOk);
    fields.set("is_err", !isOk);
    fields.set("value", val);
    fields.set("error", err);
    return { type: "object", fields };
}
// ─── Utility helpers ──────────────────────────────────────────────────────────
function native(name, arity, call) {
    return { type: "native", name, arity, call };
}
function arr(elements) {
    return { type: "array", elements };
}
function jsToHkd(v) {
    if (v === null || v === undefined)
        return null;
    if (typeof v === "boolean")
        return v;
    if (typeof v === "number")
        return v;
    if (typeof v === "string")
        return v;
    if (Array.isArray(v))
        return arr(v.map(jsToHkd));
    if (typeof v === "object") {
        const fields = new Map();
        for (const [k, val] of Object.entries(v)) {
            fields.set(k, jsToHkd(val));
        }
        return { type: "object", fields };
    }
    return null;
}
function hkdToJs(v) {
    if (v === null)
        return null;
    if (typeof v === "boolean" || typeof v === "number" || typeof v === "string")
        return v;
    if (v.type === "array") {
        return v.elements.map(hkdToJs);
    }
    if (v.type === "object") {
        const obj = {};
        for (const [k, val] of v.fields) {
            obj[k] = hkdToJs(val);
        }
        return obj;
    }
    return String(v);
}
//# sourceMappingURL=index.js.map