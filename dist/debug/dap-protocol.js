"use strict";
/**
 * HKD Debug Adapter Protocol (DAP) Types & Transport
 *
 * Implements standard VS Code Debug Adapter Protocol wire framing and schema.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DapTransport = void 0;
// ─── Streaming DAP Transport ──────────────────────────────────────────────────
class DapTransport {
    reader;
    writer;
    buffer = "";
    seq = 1;
    onMessageCallback = () => { };
    constructor(reader, writer) {
        this.reader = reader;
        this.writer = writer;
        this.reader.on("data", (chunk) => {
            this.buffer += chunk.toString("utf-8");
            this.processBuffer();
        });
    }
    onMessage(callback) {
        this.onMessageCallback = callback;
    }
    send(msg) {
        const json = JSON.stringify(msg);
        const byteLen = Buffer.byteLength(json, "utf-8");
        const payload = `Content-Length: ${byteLen}\r\n\r\n${json}`;
        this.writer.write(payload, "utf-8");
    }
    sendResponse(req, success, body, message) {
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
    sendEvent(event, body) {
        this.send({
            seq: this.seq++,
            type: "event",
            event,
            body,
        });
    }
    processBuffer() {
        while (true) {
            const headerMatch = this.buffer.match(/^Content-Length:\s*(\d+)\r\n\r\n/i);
            if (!headerMatch)
                break;
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
            }
            catch (err) {
                // Drop malformed chunks
            }
        }
    }
}
exports.DapTransport = DapTransport;
//# sourceMappingURL=dap-protocol.js.map