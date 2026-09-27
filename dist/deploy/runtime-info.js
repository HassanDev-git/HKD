"use strict";
/**
 * HKD Production Runtime Observability & Exit Codes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExitCode = void 0;
exports.getRuntimeInfo = getRuntimeInfo;
exports.printRuntimeInfo = printRuntimeInfo;
const index_js_1 = require("../utils/index.js");
var ExitCode;
(function (ExitCode) {
    ExitCode[ExitCode["Success"] = 0] = "Success";
    ExitCode[ExitCode["RuntimeError"] = 1] = "RuntimeError";
    ExitCode[ExitCode["UsageError"] = 2] = "UsageError";
    ExitCode[ExitCode["ConfigError"] = 3] = "ConfigError";
    ExitCode[ExitCode["BuildError"] = 4] = "BuildError";
    ExitCode[ExitCode["DeployError"] = 5] = "DeployError";
})(ExitCode || (exports.ExitCode = ExitCode = {}));
function getRuntimeInfo() {
    const mem = process.memoryUsage();
    return {
        version: index_js_1.HKD_VERSION,
        target: `${process.arch === "x64" ? "x86_64" : process.arch}-${process.platform === "win32" ? "windows" : process.platform}`,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
        memory: {
            rssMb: parseFloat((mem.rss / 1024 / 1024).toFixed(2)),
            heapUsedMb: parseFloat((mem.heapUsed / 1024 / 1024).toFixed(2)),
            heapTotalMb: parseFloat((mem.heapTotal / 1024 / 1024).toFixed(2)),
        },
        supportedTiers: [
            "Stack VM (Tier 0)",
            "Native Zig Baseline JIT (Tier 1)",
            "Native Optimizing JIT with PGO (Tier 2)",
            "Standalone Native AOT Executable",
        ],
        activeLimits: {
            maxConnections: 10000,
            maxRequestBodyMb: 10,
        },
    };
}
function printRuntimeInfo(report, asJson = false) {
    if (asJson) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }
    console.log(`\nHKD Production Runtime Environment v${report.version}\n`);
    console.log(`  Platform:         ${report.platform} (${report.arch})`);
    console.log(`  Target Triple:    ${report.target}`);
    console.log(`  Node Engine:      ${report.nodeVersion}`);
    console.log(`  Uptime:           ${report.uptimeSeconds}s`);
    console.log(`  Memory Usage:     RSS ${report.memory.rssMb} MB / Heap ${report.memory.heapUsedMb} MB`);
    console.log(`  Execution Tiers:`);
    for (const tier of report.supportedTiers) {
        console.log(`    - ${tier}`);
    }
    console.log("");
}
//# sourceMappingURL=runtime-info.js.map