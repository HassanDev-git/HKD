/**
 * HKD Debug Adapter Protocol Server Executable
 *
 * Runs standalone over stdio or custom streams to interface with VS Code.
 */
import { Readable, Writable } from "stream";
import { DapTransport } from "./dap-protocol.js";
import { DebugSession } from "./debug-session.js";
export declare class HkdDebugAdapterServer {
    transport: DapTransport;
    session: DebugSession;
    constructor(reader?: Readable, writer?: Writable);
}
//# sourceMappingURL=server.d.ts.map