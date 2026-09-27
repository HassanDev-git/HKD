"use strict";
/**
 * HKD MIR to Bytecode Codegen
 *
 * Lowers an optimized Control Flow Graph (CFG) into a linear Chunk of HKDB bytecode.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIRCodegen = void 0;
const chunk_js_1 = require("../bytecode/chunk.js");
class MIRCodegen {
    chunk;
    regToStack = new Map();
    blockOffsets = new Map();
    jumpPatches = [];
    constructor(name = "<script>", arity = 0) {
        this.chunk = new chunk_js_1.Chunk(name, arity);
    }
    generate(cfg) {
        // 1. Assign virtual registers to stack slots if needed
        let nextSlot = 0;
        for (const block of cfg.blocks.values()) {
            for (const instr of block.instructions) {
                if ("dst" in instr && !this.regToStack.has(instr.dst)) {
                    this.regToStack.set(instr.dst, nextSlot++);
                }
            }
        }
        this.chunk.localCount = nextSlot;
        // 2. Linearize blocks starting with entry
        const visited = new Set();
        const order = [];
        this.linearize(cfg.entryBlockId, cfg, visited, order);
        // Add any remaining reachable blocks
        for (const blockId of cfg.blocks.keys()) {
            if (!visited.has(blockId)) {
                this.linearize(blockId, cfg, visited, order);
            }
        }
        // 3. Emit bytecode for each block
        for (const blockId of order) {
            const block = cfg.blocks.get(blockId);
            if (!block)
                continue;
            this.blockOffsets.set(blockId, this.chunk.code.length);
            for (const instr of block.instructions) {
                this.emitInstr(instr);
            }
            if (block.terminator) {
                this.emitTerminator(block.terminator);
            }
        }
        // 4. Patch jump targets
        for (const patch of this.jumpPatches) {
            const targetOffset = this.blockOffsets.get(patch.targetBlockId) ?? this.chunk.code.length;
            // Relative offset from after the 2-byte operand
            const relOffset = targetOffset - (patch.byteOffset + 2);
            this.chunk.code[patch.byteOffset] = (relOffset >> 8) & 0xff;
            this.chunk.code[patch.byteOffset + 1] = relOffset & 0xff;
        }
        return this.chunk;
    }
    linearize(blockId, cfg, visited, order) {
        if (visited.has(blockId))
            return;
        visited.add(blockId);
        order.push(blockId);
        const block = cfg.blocks.get(blockId);
        if (block && block.terminator) {
            if (block.terminator.kind === "Branch") {
                this.linearize(block.terminator.target, cfg, visited, order);
            }
            else if (block.terminator.kind === "CondBranch") {
                this.linearize(block.terminator.thenTarget, cfg, visited, order);
                this.linearize(block.terminator.elseTarget, cfg, visited, order);
            }
        }
    }
    emitInstr(instr) {
        switch (instr.kind) {
            case "Const": {
                this.emitLoadConst(instr.value);
                this.emitStoreVReg(instr.dst);
                break;
            }
            case "Copy": {
                this.emitOperand(instr.src);
                this.emitStoreVReg(instr.dst);
                break;
            }
            case "BinOp": {
                this.emitOperand(instr.left);
                this.emitOperand(instr.right);
                switch (instr.op) {
                    case "+":
                        this.chunk.writeByte(32 /* Op.Add */);
                        break;
                    case "-":
                        this.chunk.writeByte(33 /* Op.Sub */);
                        break;
                    case "*":
                        this.chunk.writeByte(34 /* Op.Mul */);
                        break;
                    case "/":
                        this.chunk.writeByte(35 /* Op.Div */);
                        break;
                    case "%":
                        this.chunk.writeByte(36 /* Op.Mod */);
                        break;
                    case "<":
                        this.chunk.writeByte(50 /* Op.Lt */);
                        break;
                    case "<=":
                        this.chunk.writeByte(51 /* Op.Le */);
                        break;
                    case ">":
                        this.chunk.writeByte(52 /* Op.Gt */);
                        break;
                    case ">=":
                        this.chunk.writeByte(53 /* Op.Ge */);
                        break;
                    case "==":
                        this.chunk.writeByte(48 /* Op.Eq */);
                        break;
                    case "!=":
                        this.chunk.writeByte(49 /* Op.Ne */);
                        break;
                }
                this.emitStoreVReg(instr.dst);
                break;
            }
            case "UnaryOp": {
                this.emitOperand(instr.operand);
                if (instr.op === "-")
                    this.chunk.writeByte(38 /* Op.Neg */);
                else if (instr.op === "!")
                    this.chunk.writeByte(64 /* Op.Not */);
                this.emitStoreVReg(instr.dst);
                break;
            }
            case "LoadLocal": {
                this.chunk.writeByte(16 /* Op.LoadLocal */);
                this.chunk.writeU16(instr.slot);
                this.emitStoreVReg(instr.dst);
                break;
            }
            case "StoreLocal": {
                this.emitOperand(instr.src);
                this.chunk.writeByte(17 /* Op.StoreLocal */);
                this.chunk.writeU16(instr.slot);
                this.chunk.writeByte(5 /* Op.Pop */);
                break;
            }
            case "LoadGlobal": {
                const idx = this.chunk.addConstant(instr.name);
                this.chunk.writeByte(19 /* Op.LoadGlobal */);
                this.chunk.writeU16(idx);
                this.emitStoreVReg(instr.dst);
                break;
            }
            case "StoreGlobal": {
                this.emitOperand(instr.src);
                const idx = this.chunk.addConstant(instr.name);
                this.chunk.writeByte(20 /* Op.StoreGlobal */);
                this.chunk.writeU16(idx);
                this.chunk.writeByte(5 /* Op.Pop */);
                break;
            }
            case "Call": {
                this.emitOperand(instr.callee);
                for (const arg of instr.args) {
                    this.emitOperand(arg);
                }
                this.chunk.writeByte(96 /* Op.Call */);
                this.chunk.writeByte(instr.args.length);
                this.emitStoreVReg(instr.dst);
                break;
            }
            case "GetField": {
                this.emitOperand(instr.target);
                const idx = this.chunk.addConstant(instr.field);
                this.chunk.writeByte(129 /* Op.GetField */);
                this.chunk.writeU16(idx);
                this.emitStoreVReg(instr.dst);
                break;
            }
            case "SetField": {
                this.emitOperand(instr.target);
                this.emitOperand(instr.value);
                const idx = this.chunk.addConstant(instr.field);
                this.chunk.writeByte(130 /* Op.SetField */);
                this.chunk.writeU16(idx);
                this.chunk.writeByte(5 /* Op.Pop */);
                break;
            }
        }
    }
    emitTerminator(term) {
        if (term.kind === "Return") {
            if (term.value) {
                this.emitOperand(term.value);
            }
            else {
                this.chunk.writeByte(2 /* Op.LoadNull */);
            }
            this.chunk.writeByte(97 /* Op.Return */);
        }
        else if (term.kind === "Branch") {
            this.chunk.writeByte(80 /* Op.Jump */);
            const patchOffset = this.chunk.code.length;
            this.chunk.writeI16(0); // placeholder
            this.jumpPatches.push({ byteOffset: patchOffset, targetBlockId: term.target });
        }
        else if (term.kind === "CondBranch") {
            this.emitOperand(term.cond);
            this.chunk.writeByte(81 /* Op.JumpFalse */);
            const patchOffset = this.chunk.code.length;
            this.chunk.writeI16(0); // placeholder
            this.jumpPatches.push({ byteOffset: patchOffset, targetBlockId: term.elseTarget });
            // Unconditional jump to thenTarget if not fallthrough
            this.chunk.writeByte(80 /* Op.Jump */);
            const thenPatch = this.chunk.code.length;
            this.chunk.writeI16(0);
            this.jumpPatches.push({ byteOffset: thenPatch, targetBlockId: term.thenTarget });
        }
    }
    emitOperand(op) {
        if (op.kind === "Const") {
            this.emitLoadConst(op.value);
        }
        else {
            const slot = this.regToStack.get(op.reg) ?? 0;
            this.chunk.writeByte(16 /* Op.LoadLocal */);
            this.chunk.writeU16(slot);
        }
    }
    emitStoreVReg(reg) {
        const slot = this.regToStack.get(reg) ?? 0;
        this.chunk.writeByte(17 /* Op.StoreLocal */);
        this.chunk.writeU16(slot);
        this.chunk.writeByte(5 /* Op.Pop */);
    }
    emitLoadConst(val) {
        if (val === null) {
            this.chunk.writeByte(2 /* Op.LoadNull */);
        }
        else if (val === true) {
            this.chunk.writeByte(3 /* Op.LoadTrue */);
        }
        else if (val === false) {
            this.chunk.writeByte(4 /* Op.LoadFalse */);
        }
        else {
            const idx = this.chunk.addConstant(val);
            this.chunk.writeByte(1 /* Op.LoadConst */);
            this.chunk.writeU16(idx);
        }
    }
}
exports.MIRCodegen = MIRCodegen;
//# sourceMappingURL=codegen.js.map