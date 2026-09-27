/**
 * HKD Debug Adapter Protocol Server Executable
 *
 * Runs standalone over stdio or custom streams to interface with VS Code.
 */

import { Readable, Writable } from "stream";
import { DapTransport } from "./dap-protocol.js";
import { DebugSession } from "./debug-session.js";

export class HkdDebugAdapterServer {
  public transport: DapTransport;
  public session: DebugSession;

  constructor(
    reader: Readable = process.stdin,
    writer: Writable = process.stdout
  ) {
    this.transport = new DapTransport(reader, writer);
    this.session = new DebugSession(this.transport);
  }
}

if (process.env.NODE_ENV !== "test" && require.main === module) {
  new HkdDebugAdapterServer();
}
