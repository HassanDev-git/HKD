/**
 * HKD Standard Library
 *
 * Each module is a plain Map<string, HkdValue> that gets injected into the VM.
 * Modules are accessed via: import math
 */
import { HkdObject } from "../bytecode/chunk.js";
import { VM } from "../vm/vm.js";
export declare function setCurrentVm(vm: any): void;
export declare function registerStdlib(vm: VM): void;
/**
 * Resolve a stdlib module (e.g. "math", "json", "fs", "std.json", ...) by name.
 * Returns an HKD object whose fields are the module's members, or null if the
 * module does not exist. Used by the runtime's module loader so that
 * `hkd run <file>` exposes the standard library to HKD files.
 */
export declare function getStdModule(name: string): HkdObject | null;
//# sourceMappingURL=index.d.ts.map