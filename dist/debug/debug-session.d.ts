/**
 * HKD Debug Session & Runtime Debug Controller
 *
 * Bridges VS Code DAP requests directly to the HKD Stack VM execution loop,
 * managing breakpoints, statement stepping, call stack inspection, and evaluation.
 */
import { DapTransport, DapRequest } from "./dap-protocol.js";
import { VM, VmDebugger } from "../vm/vm.js";
export declare class DebugSession implements VmDebugger {
    private transport;
    private vm;
    private currentChunk;
    private programPath;
    private breakpoints;
    private steppingMode;
    private stepStartLine;
    private stepTargetDepth;
    private stopOnEntry;
    private executionStarted;
    constructor(transport: DapTransport);
    handleRequest(req: DapRequest): void;
    private lastPausedLine;
    private skipCurrentLineBreakpoint;
    onBeforeInstruction(_vm: VM, _frame: any, _op: number, line: number): "pause" | "continue" | void;
    private hasRunStarted;
    private startOrResume;
}
//# sourceMappingURL=debug-session.d.ts.map