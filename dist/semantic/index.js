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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGlobalScope = exports.Scope = exports.analyse = exports.SemanticAnalyser = void 0;
var analyser_js_1 = require("./analyser.js");
Object.defineProperty(exports, "SemanticAnalyser", { enumerable: true, get: function () { return analyser_js_1.SemanticAnalyser; } });
Object.defineProperty(exports, "analyse", { enumerable: true, get: function () { return analyser_js_1.analyse; } });
var scope_js_1 = require("./scope.js");
Object.defineProperty(exports, "Scope", { enumerable: true, get: function () { return scope_js_1.Scope; } });
Object.defineProperty(exports, "createGlobalScope", { enumerable: true, get: function () { return scope_js_1.createGlobalScope; } });
__exportStar(require("./types.js"), exports);
//# sourceMappingURL=index.js.map