"use strict";
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
exports.DEFAULT_EDITION = exports.SUPPORTED_EDITIONS = void 0;
exports.isValidEdition = isValidEdition;
exports.parseEdition = parseEdition;
exports.detectFileEdition = detectFileEdition;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
exports.SUPPORTED_EDITIONS = ["2026", "2027"];
exports.DEFAULT_EDITION = "2026";
/**
 * Returns true if the provided value is a supported LanguageEdition.
 */
function isValidEdition(value) {
    return value === "2026" || value === "2027";
}
/**
 * Parses and validates an edition string.
 * Defaults to "2026" if value is undefined or empty.
 * Throws an Error with a clean diagnostic if the edition is not supported.
 */
function parseEdition(value) {
    if (!value)
        return exports.DEFAULT_EDITION;
    const clean = value.trim();
    if (isValidEdition(clean)) {
        return clean;
    }
    throw new Error(`Unsupported edition '${value}'. Supported editions are: ${exports.SUPPORTED_EDITIONS.map((e) => `"${e}"`).join(", ")}.`);
}
/**
 * Detects the edition of a source file by looking for an enclosing hkd.toml.
 * Defaults to DEFAULT_EDITION ("2026") if no hkd.toml is found or edition is not specified.
 */
function detectFileEdition(filePath) {
    try {
        const abs = path.resolve(filePath);
        let dir = path.dirname(abs);
        while (dir && dir !== path.dirname(dir)) {
            const tomlPath = path.join(dir, "hkd.toml");
            if (fs.existsSync(tomlPath)) {
                const content = fs.readFileSync(tomlPath, "utf-8");
                if (/edition\s*=\s*"2027"/.test(content)) {
                    return "2027";
                }
                break;
            }
            dir = path.dirname(dir);
        }
    }
    catch { }
    return exports.DEFAULT_EDITION;
}
//# sourceMappingURL=edition.js.map