/**
 * HKD Debug Adapter Protocol (DAP) Types & Transport
 *
 * Implements standard VS Code Debug Adapter Protocol wire framing and schema.
 */
import { Readable, Writable } from "stream";
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
export declare class DapTransport {
    private reader;
    private writer;
    private buffer;
    private seq;
    private onMessageCallback;
    constructor(reader: Readable, writer: Writable);
    onMessage(callback: (msg: DapMessage) => void): void;
    send(msg: DapMessage): void;
    sendResponse(req: DapRequest, success: boolean, body?: any, message?: string): void;
    sendEvent(event: string, body?: any): void;
    private processBuffer;
}
//# sourceMappingURL=dap-protocol.d.ts.map