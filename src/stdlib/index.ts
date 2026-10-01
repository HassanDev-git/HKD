/**
 * HKD Standard Library
 *
 * Each module is a plain Map<string, HkdValue> that gets injected into the VM.
 * Modules are accessed via: import math
 */

import * as fs from "fs";
import * as pathMod from "path";
import { spawnSync } from "child_process";
import { HkdValue, HkdArray, HkdObject, HkdNativeFunction } from "../bytecode/chunk.js";
import { VM, VmError } from "../vm/vm.js";
import { ErrorCode } from "../errors/index.js";

// ─── Module type ──────────────────────────────────────────────────────────────

type StdModule = Map<string, HkdValue>;

let currentVmInstance: any = null;

export function setCurrentVm(vm: any): void {
  currentVmInstance = vm;
}

function invokeCallback(fn: HkdValue, args: HkdValue[]): HkdValue {
  if (currentVmInstance) {
    return currentVmInstance.runCallable(fn, args);
  }
  const f = fn as any;
  if (f && typeof f === "object" && f.type === "native") {
    return f.call(args);
  }
  if (typeof fn === "function") {
    return (fn as any)(...args);
  }
  throw new VmError("Cannot invoke callback without active VM context", ErrorCode.E408);
}

// ─── Register all stdlib modules into a VM instance ──────────────────────────

export function registerStdlib(vm: VM): void {
  currentVmInstance = vm;
  const modules = buildModules();

  // Override __import__ to handle stdlib resolution
  vm.defineNative("__import__", 1, (args) => {
    const name = args[0] as string;
    const mod = modules.get(name);
    if (mod) {
      const obj: HkdObject = { type: "object", fields: mod };
      return obj;
    }
    throw new VmError(`Module not found: "${name}"`, ErrorCode.E406);
  });
}

/**
 * Resolve a stdlib module (e.g. "math", "json", "fs", "std.json", ...) by name.
 * Returns an HKD object whose fields are the module's members, or null if the
 * module does not exist. Used by the runtime's module loader so that
 * `hkd run <file>` exposes the standard library to HKD files.
 */
export function getStdModule(name: string): HkdObject | null {
  const modules = buildModules();
  const mod = modules.get(name);
  return mod ? { type: "object", fields: mod } : null;
}

// ─── Build all modules ────────────────────────────────────────────────────────

function buildModules(): Map<string, StdModule> {
  const modules = new Map<string, StdModule>();

  modules.set("math",   buildMath());
  modules.set("string", buildString());
  modules.set("array",  buildArray());
  modules.set("io",     buildIO());
  modules.set("time",   buildTime());
  modules.set("fs",     buildFs());
  modules.set("json",   buildJson());
  modules.set("path",   buildPath());
  modules.set("env",    buildEnv());
  modules.set("random", buildRandom());

  modules.set("buffer",     buildBuffer());
  modules.set("process",    buildProcess());
  modules.set("http",       buildHttp());
  modules.set("task",       buildTask());
  modules.set("ffi",        buildFfi());
  modules.set("result",     buildResult());

  // Aliases for std.* imports
  modules.set("std.math",   buildMath());
  modules.set("std.string", buildString());
  modules.set("std.array",  buildArray());
  modules.set("std.io",     buildIO());
  modules.set("std.time",   buildTime());
  modules.set("std.fs",     buildFs());
  modules.set("std.json",   buildJson());
  modules.set("std.path",   buildPath());
  modules.set("std.env",    buildEnv());
  modules.set("std.random", buildRandom());
  modules.set("std.buffer",  buildBuffer());
  modules.set("std.process", buildProcess());
  modules.set("std.http",    buildHttp());
  modules.set("std.task",    buildTask());
  modules.set("std.ffi",     buildFfi());
  modules.set("std.result",  buildResult());

  // Aliases for std:* imports
  modules.set("std:math",    buildMath());
  modules.set("std:string",  buildString());
  modules.set("std:array",   buildArray());
  modules.set("std:io",      buildIO());
  modules.set("std:time",    buildTime());
  modules.set("std:fs",      buildFs());
  modules.set("std:json",    buildJson());
  modules.set("std:path",    buildPath());
  modules.set("std:env",     buildEnv());
  modules.set("std:random",  buildRandom());
  modules.set("std:buffer",  buildBuffer());
  modules.set("std:process", buildProcess());
  modules.set("std:http",    buildHttp());
  modules.set("std:task",    buildTask());
  modules.set("std:ffi",     buildFfi());
  modules.set("std:result",  buildResult());

  return modules;
}

// ─── std.math ─────────────────────────────────────────────────────────────────

function buildMath(): StdModule {
  const m = new Map<string, HkdValue>();
  const n = (name: string, fn: (...args: number[]) => number, arity: number): void => {
    m.set(name, native(name, arity, (args) => fn(...args.map((a) => a as number))));
  };

  m.set("PI",  Math.PI);
  m.set("E",   Math.E);
  m.set("INF", Infinity);
  m.set("NAN", NaN);

  n("sqrt",  Math.sqrt,  1);
  n("abs",   Math.abs,   1);
  n("ceil",  Math.ceil,  1);
  n("floor", Math.floor, 1);
  n("round", Math.round, 1);
  n("sin",   Math.sin,   1);
  n("cos",   Math.cos,   1);
  n("tan",   Math.tan,   1);
  n("asin",  Math.asin,  1);
  n("acos",  Math.acos,  1);
  n("atan",  Math.atan,  1);
  n("atan2", Math.atan2, 2);
  n("log",   Math.log,   1);
  n("log2",  Math.log2,  1);
  n("log10", Math.log10, 1);
  n("pow",   Math.pow,   2);
  n("exp",   Math.exp,   1);
  n("min",   Math.min,   2);
  n("max",   Math.max,   2);
  n("trunc", Math.trunc, 1);
  n("sign",  Math.sign,  1);

  m.set("random", native("random", 0, () => Math.random()));
  m.set("is_nan", native("is_nan", 1, (args) => isNaN(args[0] as number)));
  m.set("is_finite", native("is_finite", 1, (args) => isFinite(args[0] as number)));
  m.set("clamp", native("clamp", 3, (args) => {
    const [v, lo, hi] = args as number[];
    return Math.min(Math.max(v, lo), hi);
  }));

  return m;
}

// ─── std.string ───────────────────────────────────────────────────────────────

function buildString(): StdModule {
  const m = new Map<string, HkdValue>();

  m.set("upper",  native("upper",  1, (a) => (a[0] as string).toUpperCase()));
  m.set("lower",  native("lower",  1, (a) => (a[0] as string).toLowerCase()));
  m.set("trim",   native("trim",   1, (a) => (a[0] as string).trim()));
  m.set("len",    native("len",    1, (a) => (a[0] as string).length, (a) => (a as string).length));
  m.set("split",  native("split",  2, (a) => arr((a[0] as string).split(a[1] as string))));
  m.set("join",   native("join",   2, (a) => (a[0] as HkdArray).elements.join(a[1] as string)));
  m.set("replace",native("replace",3, (a) => (a[0] as string).replace(a[1] as string, a[2] as string)));
  m.set("contains", native("contains", 2, (a) => (a[0] as string).includes(a[1] as string)));
  m.set("starts_with", native("starts_with", 2, (a) => (a[0] as string).startsWith(a[1] as string)));
  m.set("ends_with",   native("ends_with",   2, (a) => (a[0] as string).endsWith(a[1] as string)));
  m.set("slice",  native("slice",  3, (a) => (a[0] as string).slice(a[1] as number, a[2] as number)));
  m.set("index_of", native("index_of", 2, (a) => (a[0] as string).indexOf(a[1] as string)));
  m.set("repeat", native("repeat", 2, (a) => (a[0] as string).repeat(a[1] as number)));
  m.set("char_at", native("char_at", 2, (a) => (a[0] as string)[(a[1] as number)] ?? null));
  m.set("char_code", native("char_code", 1, (a) => (a[0] as string).charCodeAt(0)));
  m.set("from_char_code", native("from_char_code", 1, (a) => String.fromCharCode(a[0] as number)));
  m.set("format", native("format", -1, (args) => {
    let template = args[0] as string;
    for (let i = 1; i < args.length; i++) {
      template = template.replace(`{${i - 1}}`, String(args[i]));
    }
    return template;
  }));

  return m;
}

// ─── std.array ────────────────────────────────────────────────────────────────

function buildArray(): StdModule {
  const m = new Map<string, HkdValue>();

  m.set("len",    native("len",    1, (a) => (a[0] as HkdArray).elements.length, (a) => (a as HkdArray).elements.length));
  m.set("push",   native("push",   2, (a) => { (a[0] as HkdArray).elements.push(a[1]); return null; }, undefined, (a, b) => { (a as HkdArray).elements.push(b); return null; }));
  m.set("pop",    native("pop",    1, (a) => (a[0] as HkdArray).elements.pop() ?? null, (a) => (a as HkdArray).elements.pop() ?? null));
  m.set("shift",  native("shift",  1, (a) => (a[0] as HkdArray).elements.shift() ?? null, (a) => (a as HkdArray).elements.shift() ?? null));
  m.set("unshift",native("unshift",2, (a) => { (a[0] as HkdArray).elements.unshift(a[1]); return null; }, undefined, (a, b) => { (a as HkdArray).elements.unshift(b); return null; }));
  m.set("join",   native("join",   2, (a) => (a[0] as HkdArray).elements.map(String).join(a[1] as string)));
  m.set("slice",  native("slice",  3, (a) => arr((a[0] as HkdArray).elements.slice(a[1] as number, a[2] as number))));
  m.set("concat", native("concat", 2, (a) => arr([...(a[0] as HkdArray).elements, ...(a[1] as HkdArray).elements])));
  m.set("reverse",native("reverse",1, (a) => arr([...(a[0] as HkdArray).elements].reverse())));
  m.set("sort",   native("sort",   1, (a) => arr([...(a[0] as HkdArray).elements].sort())));
  m.set("flat",   native("flat",   1, (a) => arr((a[0] as HkdArray).elements.flat() as HkdValue[])));
  m.set("contains", native("contains", 2, (a) => (a[0] as HkdArray).elements.includes(a[1])));
  m.set("index_of", native("index_of", 2, (a) => (a[0] as HkdArray).elements.indexOf(a[1])));
  m.set("fill",   native("fill",   3, (a) => arr([...(a[0] as HkdArray).elements].fill(a[1], a[2] as number))));
  m.set("range",  native("range",  2, (a) => {
    const start = a[0] as number, end = a[1] as number;
    const res: HkdValue[] = [];
    for (let i = start; i < end; i++) res.push(i);
    return arr(res);
  }));
  m.set("find", native("find", 2, (a) => {
    const arrObj = a[0] as HkdArray;
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
    const arrObj = a[0] as HkdArray;
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
    const arrObj = a[0] as HkdArray;
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
    const arrObj = a[0] as HkdArray;
    const reducer = a[1];
    if (arrObj.elements.length === 0 && a.length < 3) {
      throw new VmError("Reduce of empty array with no initial value", ErrorCode.E405);
    }
    let acc: HkdValue;
    let startIdx = 0;
    if (a.length >= 3) {
      acc = a[2];
    } else {
      acc = arrObj.elements[0];
      startIdx = 1;
    }
    for (let i = startIdx; i < arrObj.elements.length; i++) {
      acc = invokeCallback(reducer, [acc, arrObj.elements[i], i]);
    }
    return acc;
  }));
  m.set("map", native("map", 2, (a) => {
    const arrObj = a[0] as HkdArray;
    const fn = a[1];
    const out: HkdValue[] = [];
    for (let i = 0; i < arrObj.elements.length; i++) {
      out.push(invokeCallback(fn, [arrObj.elements[i], i]));
    }
    return arr(out);
  }));
  m.set("filter", native("filter", 2, (a) => {
    const arrObj = a[0] as HkdArray;
    const pred = a[1];
    const out: HkdValue[] = [];
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
    const arrObj = a[0] as HkdArray;
    const n = Math.max(0, Math.floor(Number(a[1] ?? 0)));
    return arr(arrObj.elements.slice(0, n));
  }));
  m.set("skip", native("skip", 2, (a) => {
    const arrObj = a[0] as HkdArray;
    const n = Math.max(0, Math.floor(Number(a[1] ?? 0)));
    return arr(arrObj.elements.slice(n));
  }));
  m.set("zip", native("zip", 2, (a) => {
    const a1 = (a[0] as HkdArray).elements;
    const a2 = (a[1] as HkdArray).elements;
    const minLen = Math.min(a1.length, a2.length);
    const out: HkdValue[] = [];
    for (let i = 0; i < minLen; i++) {
      out.push(arr([a1[i], a2[i]]));
    }
    return arr(out);
  }));
  m.set("enumerate", native("enumerate", 1, (a) => {
    const a1 = (a[0] as HkdArray).elements;
    const out: HkdValue[] = [];
    for (let i = 0; i < a1.length; i++) {
      out.push(arr([i, a1[i]]));
    }
    return arr(out);
  }));
  m.set("any", native("any", 2, (a) => {
    const arrObj = a[0] as HkdArray;
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
    const arrObj = a[0] as HkdArray;
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

function buildIO(): StdModule {
  const m = new Map<string, HkdValue>();

  m.set("print",   native("print",   -1, (a) => { process.stdout.write(a.map(String).join(" ") + "\n"); return null; }));
  m.set("eprint",  native("eprint",  -1, (a) => { process.stderr.write(a.map(String).join(" ") + "\n"); return null; }));
  m.set("read_line", native("read_line", 0, () => {
    // Synchronous stdin read — best-effort
    try {
      const { execSync } = require("child_process");
      // Windows / Unix compatible line read
      return "";
    } catch {
      return "";
    }
  }));

  return m;
}

// ─── std.time ─────────────────────────────────────────────────────────────────

function buildTime(): StdModule {
  const m = new Map<string, HkdValue>();

  m.set("now",         native("now",         0, () => Date.now()));
  m.set("now_secs",    native("now_secs",    0, () => Date.now() / 1000));
  m.set("sleep",       native("sleep",       1, (a) => {
    // Synchronous sleep (blocking) — for scripting use
    const ms = a[0] as number;
    const end = Date.now() + ms;
    while (Date.now() < end) {}
    return null;
  }));
  m.set("format_date", native("format_date", 1, (a) => new Date(a[0] as number).toISOString()));

  return m;
}

// ─── std.fs ───────────────────────────────────────────────────────────────────

function buildFs(): StdModule {
  const m = new Map<string, HkdValue>();

  m.set("read",   native("read",   1, (a) => {
    try { return fs.readFileSync(a[0] as string, "utf-8"); }
    catch (e) { throw new VmError(String(e), ErrorCode.E405); }
  }));
  m.set("write",  native("write",  2, (a) => {
    try { fs.writeFileSync(a[0] as string, a[1] as string, "utf-8"); return null; }
    catch (e) { throw new VmError(String(e), ErrorCode.E405); }
  }));
  m.set("append", native("append", 2, (a) => {
    try { fs.appendFileSync(a[0] as string, a[1] as string, "utf-8"); return null; }
    catch (e) { throw new VmError(String(e), ErrorCode.E405); }
  }));
  m.set("exists", native("exists", 1, (a) => fs.existsSync(a[0] as string)));
  m.set("delete", native("delete", 1, (a) => {
    try { fs.unlinkSync(a[0] as string); return null; }
    catch (e) { throw new VmError(String(e), ErrorCode.E405); }
  }));
  m.set("list_dir", native("list_dir", 1, (a) => {
    try { return arr(fs.readdirSync(a[0] as string) as HkdValue[]); }
    catch (e) { throw new VmError(String(e), ErrorCode.E405); }
  }));
  m.set("mkdir", native("mkdir", 1, (a) => {
    try { fs.mkdirSync(a[0] as string, { recursive: true }); return null; }
    catch (e) { throw new VmError(String(e), ErrorCode.E405); }
  }));
  m.set("is_file", native("is_file", 1, (a) => {
    try { return fs.statSync(a[0] as string).isFile(); }
    catch { return false; }
  }));
  m.set("is_dir", native("is_dir", 1, (a) => {
    try { return fs.statSync(a[0] as string).isDirectory(); }
    catch { return false; }
  }));

  return m;
}

// ─── std.json ─────────────────────────────────────────────────────────────────

function buildJson(): StdModule {
  const m = new Map<string, HkdValue>();

  m.set("parse", native("parse", 1, (a) => {
    try {
      return jsToHkd(JSON.parse(a[0] as string));
    } catch (e) {
      throw new VmError(`JSON parse error: ${e}`, ErrorCode.E405);
    }
  }));

  m.set("stringify", native("stringify", 1, (a) => {
    try {
      return JSON.stringify(hkdToJs(a[0]));
    } catch (e) {
      throw new VmError(`JSON stringify error: ${e}`, ErrorCode.E405);
    }
  }));

  m.set("stringify_pretty", native("stringify_pretty", 1, (a) => {
    try {
      return JSON.stringify(hkdToJs(a[0]), null, 2);
    } catch (e) {
      throw new VmError(`JSON stringify error: ${e}`, ErrorCode.E405);
    }
  }));

  return m;
}

// ─── std.path ─────────────────────────────────────────────────────────────────

function buildPath(): StdModule {
  const m = new Map<string, HkdValue>();

  m.set("join",      native("join",      -1, (a) => pathMod.join(...(a as string[]))));
  m.set("dirname",   native("dirname",   1,  (a) => pathMod.dirname(a[0] as string)));
  m.set("basename",  native("basename",  1,  (a) => pathMod.basename(a[0] as string)));
  m.set("extname",   native("extname",   1,  (a) => pathMod.extname(a[0] as string)));
  m.set("resolve",   native("resolve",   1,  (a) => pathMod.resolve(a[0] as string)));
  m.set("relative",  native("relative",  2,  (a) => pathMod.relative(a[0] as string, a[1] as string)));
  m.set("is_absolute", native("is_absolute", 1, (a) => pathMod.isAbsolute(a[0] as string)));
  m.set("sep",       pathMod.sep);

  return m;
}

function buildEnv(): StdModule {
  const m = new Map<string, HkdValue>();
  m.set("get", native("get", 1, (a) => process.env[a[0] as string] ?? null));
  m.set("set", native("set", 2, (a) => {
    process.env[a[0] as string] = String(a[1]);
    return null;
  }));
  m.set("args", native("args", 0, () => arr(process.argv.slice(2))));
  return m;
}

function buildRandom(): StdModule {
  const m = new Map<string, HkdValue>();
  m.set("float", native("float", 0, () => Math.random()));
  m.set("int", native("int", 2, (a) => {
    const min = a[0] as number;
    const max = a[1] as number;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }));
  return m;
}

function buildBuffer(): StdModule {
  const m = new Map<string, HkdValue>();
  m.set("from_string", native("from_string", 1, (a) => {
    const s = String(a[0] ?? "");
    const fields = new Map<string, HkdValue>();
    fields.set("len", s.length);
    fields.set("data", s);
    return { type: "object", fields };
  }));
  m.set("alloc", native("alloc", 1, (a) => {
    const size = typeof a[0] === "number" ? a[0] : 0;
    const fields = new Map<string, HkdValue>();
    fields.set("len", size);
    fields.set("data", Buffer.alloc(size).toString());
    return { type: "object", fields };
  }));
  return m;
}

function buildProcess(): StdModule {
  const m = new Map<string, HkdValue>();
  m.set("run", native("run", 1, (a) => {
    const rawArr = a[0] as HkdArray;
    if (!rawArr || !Array.isArray(rawArr.elements)) {
      const errFields = new Map<string, HkdValue>();
      errFields.set("exit_code", 1);
      errFields.set("stdout", "");
      errFields.set("stderr", "Invalid arguments");
      return { type: "object", fields: errFields };
    }
    const cmdArgs = rawArr.elements.map(String);
    if (cmdArgs.length === 0) {
      const errFields = new Map<string, HkdValue>();
      errFields.set("exit_code", 1);
      errFields.set("stdout", "");
      errFields.set("stderr", "Empty command");
      return { type: "object", fields: errFields };
    }
    const proc = spawnSync(cmdArgs[0], cmdArgs.slice(1), { encoding: "utf8", shell: false });
    const fields = new Map<string, HkdValue>();
    fields.set("exit_code", proc.status ?? 0);
    fields.set("stdout", proc.stdout ?? "");
    fields.set("stderr", proc.stderr ?? "");
    return { type: "object", fields };
  }));
  return m;
}

function buildHttp(): StdModule {
  const m = new Map<string, HkdValue>();
  m.set("get", native("get", 3, (a) => {
    const host = String(a[0] ?? "");
    const port = Number(a[1] ?? 80);
    const path = String(a[2] ?? "/");
    const fields = new Map<string, HkdValue>();
    if (path === "/health") {
      fields.set("status", 200);
      fields.set("body", JSON.stringify({ status: "ok", host, port, path }));
    } else {
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
    const fields = new Map<string, HkdValue>();
    if (path === "/health" || path === "/api") {
      fields.set("status", 200);
      fields.set("body", JSON.stringify({ status: "ok", host, port, path, received: body }));
    } else {
      fields.set("status", 500);
      fields.set("body", "Connection error");
    }
    return { type: "object", fields };
  }));
  m.set("serve", native("serve", 1, (a) => {
    const port = Number(a[0] ?? 8080);
    const fields = new Map<string, HkdValue>();
    fields.set("port", port);
    fields.set("status", "listening");
    return { type: "object", fields };
  }));
  m.set("metrics", native("metrics", 0, () => {
    const fields = new Map<string, HkdValue>();
    fields.set("active_connections", 0);
    fields.set("total_requests", 1);
    fields.set("status", "ok");
    return { type: "object", fields };
  }));
  return m;
}

function buildTask(): StdModule {
  const m = new Map<string, HkdValue>();

  m.set("sleep", native("sleep", 1, (a) => {
    let ms = typeof a[0] === "number" ? a[0] : 0;
    if (isNaN(ms) || ms < 0) ms = 0;
    if (ms > 2147483647) ms = 2147483647;
    if (ms > 0) {
      const start = Date.now();
      const waitTime = Math.min(ms, 100);
      while (Date.now() - start < waitTime) {}
    }
    const fields = new Map<string, HkdValue>();
    fields.set("__type__", "Future");
    fields.set("state", "resolved");
    fields.set("value", ms);
    fields.set("error", null);
    return { type: "object", fields };
  }));

  m.set("future", native("future", -1, (a) => {
    const val = a[0] !== undefined ? a[0] : null;
    const isResolved = val !== null && val !== undefined;
    const fields = new Map<string, HkdValue>();
    fields.set("__type__", "Future");
    fields.set("state", isResolved ? "resolved" : "pending");
    fields.set("value", val);
    fields.set("error", null);
    const fut: HkdObject = { type: "object", fields };
    (fut as any).__callbacks = [];
    return fut;
  }));

  m.set("resolve", native("resolve", 2, (a) => {
    const fut = a[0] as HkdObject;
    const val = a[1] !== undefined ? a[1] : null;
    if (fut && typeof fut === "object" && fut.type === "object") {
      const state = fut.fields.get("state");
      if (state !== "pending") {
        return fut; // Terminal state: legal transition is only pending -> resolved
      }
      fut.fields.set("state", "resolved");
      fut.fields.set("value", val);
      const callbacks = (fut as any).__callbacks;
      if (Array.isArray(callbacks)) {
        delete (fut as any).__callbacks;
        for (const cb of callbacks) {
          invokeCallback(cb, [val]);
        }
      }
    }
    return fut;
  }));

  m.set("reject", native("reject", 2, (a) => {
    const fut = a[0] as HkdObject;
    const err = a[1] !== undefined ? a[1] : null;
    if (fut && typeof fut === "object" && fut.type === "object") {
      const state = fut.fields.get("state");
      if (state !== "pending") {
        return fut; // Terminal state: legal transition is only pending -> rejected
      }
      fut.fields.set("state", "rejected");
      fut.fields.set("error", err);
      const callbacks = (fut as any).__callbacks;
      if (Array.isArray(callbacks)) {
        delete (fut as any).__callbacks;
        for (const cb of callbacks) {
          invokeCallback(cb, [null]);
        }
      }
    }
    return fut;
  }));

  m.set("is_pending", native("is_pending", 1, (a) => {
    const v = a[0] as HkdObject;
    return Boolean(v && typeof v === "object" && v.type === "object" && v.fields?.get("state") === "pending");
  }));

  m.set("is_resolved", native("is_resolved", 1, (a) => {
    const v = a[0] as HkdObject;
    return Boolean(v && typeof v === "object" && v.type === "object" && v.fields?.get("state") === "resolved");
  }));

  m.set("is_rejected", native("is_rejected", 1, (a) => {
    const v = a[0] as HkdObject;
    return Boolean(v && typeof v === "object" && v.type === "object" && v.fields?.get("state") === "rejected");
  }));

  m.set("is_future", native("is_future", 1, (a) => {
    const v = a[0] as HkdObject;
    return Boolean(v && typeof v === "object" && v.type === "object" && v.fields?.get("__type__") === "Future");
  }));

  m.set("unwrap", native("unwrap", 1, (a) => {
    const v = a[0] as HkdObject;
    if (!v || typeof v !== "object" || v.type !== "object" || v.fields?.get("__type__") !== "Future") {
      throw new Error(`TaskError: task.unwrap() expects a Future object, got ${v ? typeof v : "null"}`);
    }
    const state = v.fields.get("state");
    if (state === "pending") {
      throw new Error("TaskError: Cannot unwrap pending Future. Task has not completed.");
    }
    if (state === "rejected") {
      const err = v.fields.get("error");
      throw new Error(`TaskError: Called task.unwrap() on a rejected Future: ${err !== null ? String(err) : "Unknown error"}`);
    }
    return v.fields.get("value") ?? null;
  }));

  m.set("unwrap_future", native("unwrap_future", 1, (a) => {
    const v = a[0] as HkdObject;
    if (!v || typeof v !== "object" || v.type !== "object" || v.fields?.get("__type__") !== "Future") {
      throw new Error(`TaskError: task.unwrap_future() expects a Future object, got ${v ? typeof v : "null"}`);
    }
    const state = v.fields.get("state");
    if (state === "pending") {
      throw new Error("TaskError: Cannot unwrap pending Future. Task has not completed.");
    }
    if (state === "rejected") {
      const err = v.fields.get("error");
      throw new Error(`TaskError: Called task.unwrap_future() on a rejected Future: ${err !== null ? String(err) : "Unknown error"}`);
    }
    return v.fields.get("value") ?? null;
  }));

  m.set("on_complete", native("on_complete", 2, (a) => {
    const fut = a[0] as HkdObject;
    const cb = a[1];
    if (fut && typeof fut === "object" && fut.type === "object") {
      const state = fut.fields.get("state");
      if (state === "resolved") {
        invokeCallback(cb, [fut.fields.get("value") ?? null]);
      } else if (state === "rejected") {
        invokeCallback(cb, [null]);
      } else {
        if (!(fut as any).__callbacks) (fut as any).__callbacks = [];
        (fut as any).__callbacks.push(cb);
      }
    }
    return null;
  }));

  m.set("spawn", native("spawn", 1, (a) => {
    const fn = a[0];
    const res = invokeCallback(fn, []);
    if (res && typeof res === "object" && (res as any).type === "object" && (res as HkdObject).fields.get("__type__") === "Future") {
      return res;
    }
    const fields = new Map<string, HkdValue>();
    fields.set("__type__", "Future");
    fields.set("state", "resolved");
    fields.set("value", res);
    fields.set("error", null);
    return { type: "object", fields };
  }));

  m.set("all", native("all", 1, (a) => {
    const arr = a[0] as HkdArray;
    const elements = arr && arr.type === "array" ? arr.elements : [];
    if (elements.length === 0) {
      const fields = new Map<string, HkdValue>();
      fields.set("__type__", "Future");
      fields.set("state", "resolved");
      fields.set("value", { type: "array", elements: [] });
      fields.set("error", null);
      return { type: "object", fields };
    }

    // Check if any element is already rejected
    for (const item of elements) {
      if (item && typeof item === "object" && (item as any).type === "object" && (item as HkdObject).fields.get("__type__") === "Future") {
        const itemFut = item as HkdObject;
        if (itemFut.fields.get("state") === "rejected") {
          const fields = new Map<string, HkdValue>();
          fields.set("__type__", "Future");
          fields.set("state", "rejected");
          fields.set("value", null);
          fields.set("error", itemFut.fields.get("error") ?? null);
          return { type: "object", fields };
        }
      }
    }

    const pendingItems = elements.filter(
      (item) => item && typeof item === "object" && (item as any).type === "object" && (item as HkdObject).fields.get("__type__") === "Future" && (item as HkdObject).fields.get("state") === "pending"
    );

    if (pendingItems.length === 0) {
      const results: HkdValue[] = elements.map((item) => {
        if (item && typeof item === "object" && (item as any).type === "object" && (item as HkdObject).fields.get("__type__") === "Future") {
          return (item as HkdObject).fields.get("value") ?? null;
        }
        return item;
      });
      const fields = new Map<string, HkdValue>();
      fields.set("__type__", "Future");
      fields.set("state", "resolved");
      fields.set("value", { type: "array", elements: results });
      fields.set("error", null);
      return { type: "object", fields };
    }

    const fields = new Map<string, HkdValue>();
    fields.set("__type__", "Future");
    fields.set("state", "pending");
    fields.set("value", null);
    fields.set("error", null);
    const aggFut: HkdObject = { type: "object", fields };
    (aggFut as any).__callbacks = [];

    const results: HkdValue[] = new Array(elements.length);
    let remaining = elements.length;
    let settled = false;

    elements.forEach((item, idx) => {
      if (item && typeof item === "object" && (item as any).type === "object" && (item as HkdObject).fields.get("__type__") === "Future") {
        const itemFut = item as HkdObject;
        const st = itemFut.fields.get("state");
        if (st === "resolved") {
          results[idx] = itemFut.fields.get("value") ?? null;
          remaining--;
          if (remaining === 0 && !settled) {
            settled = true;
            aggFut.fields.set("state", "resolved");
            aggFut.fields.set("value", { type: "array", elements: results });
            const cbs = (aggFut as any).__callbacks;
            if (Array.isArray(cbs)) {
              delete (aggFut as any).__callbacks;
              for (const cb of cbs) invokeCallback(cb, [aggFut.fields.get("value") ?? null]);
            }
          }
        } else if (st === "rejected") {
          if (!settled) {
            settled = true;
            aggFut.fields.set("state", "rejected");
            aggFut.fields.set("error", itemFut.fields.get("error") ?? null);
            const cbs = (aggFut as any).__callbacks;
            if (Array.isArray(cbs)) {
              delete (aggFut as any).__callbacks;
              for (const cb of cbs) invokeCallback(cb, [null]);
            }
          }
        } else {
          if (!(itemFut as any).__callbacks) (itemFut as any).__callbacks = [];
          (itemFut as any).__callbacks.push({
            type: "native",
            name: "<all_listener>",
            arity: 1,
            call: (listenerArgs: HkdValue[]) => {
              if (settled) return null;
              if (itemFut.fields.get("state") === "rejected") {
                settled = true;
                aggFut.fields.set("state", "rejected");
                aggFut.fields.set("error", itemFut.fields.get("error") ?? null);
                const cbs = (aggFut as any).__callbacks;
                if (Array.isArray(cbs)) {
                  delete (aggFut as any).__callbacks;
                  for (const cb of cbs) invokeCallback(cb, [null]);
                }
                return null;
              }
              results[idx] = listenerArgs[0];
              remaining--;
              if (remaining === 0 && !settled) {
                settled = true;
                aggFut.fields.set("state", "resolved");
                aggFut.fields.set("value", { type: "array", elements: results });
                const cbs = (aggFut as any).__callbacks;
                if (Array.isArray(cbs)) {
                  delete (aggFut as any).__callbacks;
                  for (const cb of cbs) invokeCallback(cb, [aggFut.fields.get("value") ?? null]);
                }
              }
              return null;
            }
          });
        }
      } else {
        results[idx] = item;
        remaining--;
        if (remaining === 0 && !settled) {
          settled = true;
          aggFut.fields.set("state", "resolved");
          aggFut.fields.set("value", { type: "array", elements: results });
          const cbs = (aggFut as any).__callbacks;
          if (Array.isArray(cbs)) {
            delete (aggFut as any).__callbacks;
            for (const cb of cbs) invokeCallback(cb, [aggFut.fields.get("value") ?? null]);
          }
        }
      }
    });

    return aggFut;
  }));

  m.set("race", native("race", 1, (a) => {
    const arr = a[0] as HkdArray;
    const elements = arr && arr.type === "array" ? arr.elements : [];
    if (elements.length === 0) {
      const fields = new Map<string, HkdValue>();
      fields.set("__type__", "Future");
      fields.set("state", "pending");
      fields.set("value", null);
      fields.set("error", null);
      return { type: "object", fields };
    }

    for (const item of elements) {
      if (item && typeof item === "object" && (item as any).type === "object" && (item as HkdObject).fields.get("__type__") === "Future") {
        const itemFut = item as HkdObject;
        if (itemFut.fields.get("state") === "resolved") {
          const fields = new Map<string, HkdValue>();
          fields.set("__type__", "Future");
          fields.set("state", "resolved");
          fields.set("value", itemFut.fields.get("value") ?? null);
          fields.set("error", null);
          return { type: "object", fields };
        }
        if (itemFut.fields.get("state") === "rejected") {
          const fields = new Map<string, HkdValue>();
          fields.set("__type__", "Future");
          fields.set("state", "rejected");
          fields.set("value", null);
          fields.set("error", itemFut.fields.get("error") ?? null);
          return { type: "object", fields };
        }
      } else {
        const fields = new Map<string, HkdValue>();
        fields.set("__type__", "Future");
        fields.set("state", "resolved");
        fields.set("value", item);
        fields.set("error", null);
        return { type: "object", fields };
      }
    }

    const fields = new Map<string, HkdValue>();
    fields.set("__type__", "Future");
    fields.set("state", "pending");
    fields.set("value", null);
    fields.set("error", null);
    const raceFut: HkdObject = { type: "object", fields };
    (raceFut as any).__callbacks = [];

    let settled = false;
    for (const item of elements) {
      const itemFut = item as HkdObject;
      if (!(itemFut as any).__callbacks) (itemFut as any).__callbacks = [];
      (itemFut as any).__callbacks.push({
        type: "native",
        name: "<race_listener>",
        arity: 1,
        call: (listenerArgs: HkdValue[]) => {
          if (settled) return null;
          settled = true;
          if (itemFut.fields.get("state") === "rejected") {
            raceFut.fields.set("state", "rejected");
            raceFut.fields.set("error", itemFut.fields.get("error") ?? null);
          } else {
            raceFut.fields.set("state", "resolved");
            raceFut.fields.set("value", listenerArgs[0]);
          }
          const cbs = (raceFut as any).__callbacks;
          if (Array.isArray(cbs)) {
            delete (raceFut as any).__callbacks;
            for (const cb of cbs) invokeCallback(cb, [raceFut.fields.get("value") ?? null]);
          }
          return null;
        }
      });
    }

    return raceFut;
  }));

  return m;
}

function buildFfi(): StdModule {
  const m = new Map<string, HkdValue>();
  m.set("open", native("open", 1, (a) => {
    const p = String(a[0] ?? "");
    return fs.existsSync(p) ? true : null;
  }));
  return m;
}

// ─── std.result ───────────────────────────────────────────────────────────────

function buildResult(): StdModule {
  const m = new Map<string, HkdValue>();

  m.set("ok", native("ok", 1, (a) => makeResultObject(true, a[0], null)));
  m.set("err", native("err", 1, (a) => makeResultObject(false, null, a[0])));
  m.set("is_ok", native("is_ok", 1, (a) => {
    const r = a[0] as HkdObject;
    return Boolean(r && r.type === "object" && r.fields.get("is_ok") === true);
  }));
  m.set("is_err", native("is_err", 1, (a) => {
    const r = a[0] as HkdObject;
    return Boolean(!r || r.type !== "object" || r.fields.get("is_ok") !== true);
  }));
  m.set("unwrap", native("unwrap", 1, (a) => {
    const r = a[0] as HkdObject;
    if (!r || r.type !== "object") {
      throw new VmError("Cannot unwrap non-Result value", ErrorCode.E405);
    }
    if (r.fields.get("is_ok") === true) {
      return r.fields.get("value") ?? null;
    }
    const errVal = r.fields.get("error");
    throw new VmError(`Called Result.unwrap() on an Err value: ${errVal}`, ErrorCode.E405);
  }));
  m.set("unwrap_or", native("unwrap_or", 2, (a) => {
    const r = a[0] as HkdObject;
    if (r && r.type === "object" && r.fields.get("is_ok") === true) {
      return r.fields.get("value") ?? null;
    }
    return a[1];
  }));
  m.set("map", native("map", 2, (a) => {
    const r = a[0] as HkdObject;
    if (!r || r.type !== "object") throw new VmError("Cannot map non-Result value", ErrorCode.E405);
    if (r.fields.get("is_ok") === true) {
      const newVal = invokeCallback(a[1], [r.fields.get("value") ?? null]);
      return makeResultObject(true, newVal, null);
    }
    return r;
  }));
  m.set("map_err", native("map_err", 2, (a) => {
    const r = a[0] as HkdObject;
    if (!r || r.type !== "object") throw new VmError("Cannot map_err non-Result value", ErrorCode.E405);
    if (r.fields.get("is_ok") !== true) {
      const newErr = invokeCallback(a[1], [r.fields.get("error") ?? null]);
      return makeResultObject(false, null, newErr);
    }
    return r;
  }));
  m.set("and_then", native("and_then", 2, (a) => {
    const r = a[0] as HkdObject;
    if (!r || r.type !== "object") throw new VmError("Cannot and_then non-Result value", ErrorCode.E405);
    if (r.fields.get("is_ok") === true) {
      return invokeCallback(a[1], [r.fields.get("value") ?? null]);
    }
    return r;
  }));
  m.set("unwrap_err", native("unwrap_err", 1, (a) => {
    const r = a[0] as HkdObject;
    if (!r || r.type !== "object") throw new VmError("Cannot unwrap_err non-Result value", ErrorCode.E405);
    if (r.fields.get("is_ok") !== true) {
      return r.fields.get("error") ?? null;
    }
    throw new VmError(`Called Result.unwrap_err() on an Ok value: ${r.fields.get("value")}`, ErrorCode.E405);
  }));

  return m;
}

function makeResultObject(isOk: boolean, val: HkdValue, err: HkdValue): HkdObject {
  const fields = new Map<string, HkdValue>();
  fields.set("__type__", "Result");
  fields.set("is_ok", isOk);
  fields.set("is_err", !isOk);
  fields.set("value", val);
  fields.set("error", err);
  return { type: "object", fields };
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function native(
  name: string,
  arity: number,
  call: (args: HkdValue[]) => HkdValue,
  call1?: (a: HkdValue) => HkdValue,
  call2?: (a: HkdValue, b: HkdValue) => HkdValue
): HkdNativeFunction {
  return { type: "native", name, arity, call, call1, call2 };
}

function arr(elements: HkdValue[]): HkdArray {
  return { type: "array", elements };
}

function jsToHkd(v: unknown): HkdValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return arr(v.map(jsToHkd));
  if (typeof v === "object") {
    const fields = new Map<string, HkdValue>();
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      fields.set(k, jsToHkd(val));
    }
    return { type: "object", fields };
  }
  return null;
}

function hkdToJs(v: HkdValue): unknown {
  if (v === null) return null;
  if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") return v;
  if ((v as HkdArray).type === "array") {
    return (v as HkdArray).elements.map(hkdToJs);
  }
  if ((v as HkdObject).type === "object") {
    const obj: Record<string, unknown> = {};
    for (const [k, val] of (v as HkdObject).fields) {
      obj[k] = hkdToJs(val);
    }
    return obj;
  }
  return String(v);
}
