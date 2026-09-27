/**
 * HKD Debug Adapter Protocol (DAP) Types & Transport
 *
 * Implements standard VS Code Debug Adapter Protocol wire framing and schema.
 */

import { Readable, Writable } from "stream";

// ─── Base Protocol Message ────────────────────────────────────────────────────

export interface DapProtocolMessage {
  seq: number;
  type: "request" | "response" | "event";
}

export interface DapRequest extends DapProtocolMessage {
  type: "request";
  command: string;
  arguments?: any;
}

export interface DapResponse extends DapProtocolMessage {
  type: "response";
  request_seq: number;
  success: boolean;
  command: string;
  message?: string;
  body?: any;
}

export interface DapEvent extends DapProtocolMessage {
  type: "event";
  event: string;
  body?: any;
}

export type DapMessage = DapRequest | DapResponse | DapEvent;

export interface Source {
  name?: string;
  path?: string;
}

export interface SourceBreakpoint {
  line: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
}

export interface Breakpoint {
  id?: number;
  verified: boolean;
  message?: string;
  source?: Source;
  line?: number;
  column?: number;
}

export interface StackFrame {
  id: number;
  name: string;
  source?: Source;
  line: number;
  column: number;
}

export interface Scope {
  name: string;
  variablesReference: number;
  expensive: boolean;
}

export interface Variable {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
}

export interface Thread {
  id: number;
  name: string;
}

// ─── Streaming DAP Transport ──────────────────────────────────────────────────

export class DapTransport {
  private buffer = "";
  private seq = 1;
  private onMessageCallback: (msg: DapMessage) => void = () => {};

  constructor(
    private reader: Readable,
    private writer: Writable
  ) {
    this.reader.on("data", (chunk: Buffer | string) => {
      this.buffer += chunk.toString("utf-8");
      this.processBuffer();
    });
  }

  onMessage(callback: (msg: DapMessage) => void): void {
    this.onMessageCallback = callback;
  }

  send(msg: DapMessage): void {
    const json = JSON.stringify(msg);
    const byteLen = Buffer.byteLength(json, "utf-8");
    const payload = `Content-Length: ${byteLen}\r\n\r\n${json}`;
    this.writer.write(payload, "utf-8");
  }

  sendResponse(req: DapRequest, success: boolean, body?: any, message?: string): void {
    this.send({
      seq: this.seq++,
      type: "response",
      request_seq: req.seq,
      command: req.command,
      success,
      body,
      message,
    });
  }

  sendEvent(event: string, body?: any): void {
    this.send({
      seq: this.seq++,
      type: "event",
      event,
      body,
    });
  }

  private processBuffer(): void {
    while (true) {
      const headerMatch = this.buffer.match(/^Content-Length:\s*(\d+)\r\n\r\n/i);
      if (!headerMatch) break;

      const headerLen = headerMatch[0].length;
      const contentLength = parseInt(headerMatch[1], 10);

      if (this.buffer.length < headerLen + contentLength) {
        break;
      }

      const bodyStr = this.buffer.slice(headerLen, headerLen + contentLength);
      this.buffer = this.buffer.slice(headerLen + contentLength);

      try {
        const parsed = JSON.parse(bodyStr);
        this.onMessageCallback(parsed);
      } catch (err: any) {
        // Drop malformed chunks
      }
    }
  }
}
