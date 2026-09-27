"use strict";
/**
 * HKD Debug Adapter Protocol Server Executable
 *
 * Runs standalone over stdio or custom streams to interface with VS Code.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HkdDebugAdapterServer = void 0;
const dap_protocol_js_1 = require("./dap-protocol.js");
const debug_session_js_1 = require("./debug-session.js");
class HkdDebugAdapterServer {
    transport;
    session;
    constructor(reader = process.stdin, writer = process.stdout) {
        this.transport = new dap_protocol_js_1.DapTransport(reader, writer);
        this.session = new debug_session_js_1.DebugSession(this.transport);
    }
}
exports.HkdDebugAdapterServer = HkdDebugAdapterServer;
if (process.env.NODE_ENV !== "test" && require.main === module) {
    new HkdDebugAdapterServer();
}
//# sourceMappingURL=server.js.map