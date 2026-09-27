"use strict";
/**
 * HKD MIR Optimizer 2.0
 *
 * Implements multi-pass compiler optimizations on SSA-ready MIR:
 * 1. Constant Folding & Constant Propagation
 * 2. Copy Propagation
 * 3. Algebraic Simplification (x + 0 -> x, x * 1 -> x, x * 0 -> 0)
 * 4. Common Subexpression Elimination (CSE)
 * 5. Dead Code Elimination (DCE) & Dead Store Elimination
 * 6. Jump Threading & Block Simplification
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIROptimizer = void 0;
class MIROptimizer {
    stats = {
        foldedConstants: 0,
        propagatedConstants: 0,
        copiesPropagated: 0,
        algebraicSimplifications: 0,
        commonSubexpressionsEliminated: 0,
        eliminatedInstructions: 0,
        eliminatedBlocks: 0,
        threadedJumps: 0,
        hoistedLoopInvariants: 0,
        scalarReplacements: 0,
        inlinedCalls: 0,
        reorderedBranches: 0,
    };
    optimize(cfg) {
        let changed = true;
        let passes = 0;
        const maxPasses = 10;
        while (changed && passes < maxPasses) {
            changed = false;
            passes++;
            if (this.runConstantFoldingAndPropagation(cfg))
                changed = true;
            if (this.runCopyPropagation(cfg))
                changed = true;
            if (this.runAlgebraicSimplification(cfg))
                changed = true;
            if (this.runCommonSubexpressionElimination(cfg))
                changed = true;
            if (this.runLoopOptimizations(cfg))
                changed = true;
            if (this.runEscapeAnalysisAndSROA(cfg))
                changed = true;
            if (this.runDeadCodeElimination(cfg))
                changed = true;
            if (this.runJumpThreading(cfg))
                changed = true;
            if (this.runBranchAndControlFlowOptimization(cfg))
                changed = true;
        }
        return cfg;
    }
    /**
     * Pass 1: Constant Folding and Propagation
     */
    runConstantFoldingAndPropagation(cfg) {
        let changed = false;
        const knownConstants = new Map();
        for (const block of cfg.blocks.values()) {
            const newInstructions = [];
            for (const instr of block.instructions) {
                // 1. Constant Propagation: replace Reg with known Const
                this.propagateOperands(instr, knownConstants);
                // 2. Constant Folding
                if (instr.kind === "Const") {
                    knownConstants.set(instr.dst, instr.value);
                    newInstructions.push(instr);
                }
                else if (instr.kind === "Copy" && instr.src.kind === "Const") {
                    knownConstants.set(instr.dst, instr.src.value);
                    newInstructions.push({ kind: "Const", dst: instr.dst, value: instr.src.value });
                    this.stats.foldedConstants++;
                    changed = true;
                }
                else if (instr.kind === "BinOp" && instr.left.kind === "Const" && instr.right.kind === "Const") {
                    const folded = this.evalBinary(instr.op, instr.left.value, instr.right.value);
                    if (folded !== undefined) {
                        knownConstants.set(instr.dst, folded);
                        newInstructions.push({ kind: "Const", dst: instr.dst, value: folded });
                        this.stats.foldedConstants++;
                        changed = true;
                    }
                    else {
                        newInstructions.push(instr);
                    }
                }
                else if (instr.kind === "UnaryOp" && instr.operand.kind === "Const") {
                    const folded = this.evalUnary(instr.op, instr.operand.value);
                    if (folded !== undefined) {
                        knownConstants.set(instr.dst, folded);
                        newInstructions.push({ kind: "Const", dst: instr.dst, value: folded });
                        this.stats.foldedConstants++;
                        changed = true;
                    }
                    else {
                        newInstructions.push(instr);
                    }
                }
                else {
                    newInstructions.push(instr);
                }
            }
            block.instructions = newInstructions;
            // Also fold conditional branches if condition is a known constant
            if (block.terminator && block.terminator.kind === "CondBranch" && block.terminator.cond.kind === "Const") {
                const condVal = Boolean(block.terminator.cond.value);
                const target = condVal ? block.terminator.thenTarget : block.terminator.elseTarget;
                block.terminator = { kind: "Branch", target };
                this.stats.foldedConstants++;
                changed = true;
            }
        }
        return changed;
    }
    /**
     * Pass 2: Copy Propagation
     * If %dst = Copy %src, forward %src to subsequent uses of %dst within the block.
     */
    runCopyPropagation(cfg) {
        let changed = false;
        for (const block of cfg.blocks.values()) {
            const copyMap = new Map();
            for (const instr of block.instructions) {
                // Substitute operands if mapped
                const rewriteOp = (op) => {
                    if (op.kind === "Reg" && copyMap.has(op.reg)) {
                        this.stats.copiesPropagated++;
                        changed = true;
                        return { kind: "Reg", reg: copyMap.get(op.reg) };
                    }
                    return op;
                };
                if (instr.kind === "Copy") {
                    instr.src = rewriteOp(instr.src);
                    if (instr.src.kind === "Reg") {
                        copyMap.set(instr.dst, instr.src.reg);
                    }
                }
                else if (instr.kind === "BinOp") {
                    instr.left = rewriteOp(instr.left);
                    instr.right = rewriteOp(instr.right);
                }
                else if (instr.kind === "UnaryOp") {
                    instr.operand = rewriteOp(instr.operand);
                }
                else if (instr.kind === "StoreLocal") {
                    instr.src = rewriteOp(instr.src);
                }
                else if (instr.kind === "StoreGlobal") {
                    instr.src = rewriteOp(instr.src);
                }
                else if (instr.kind === "Call") {
                    instr.callee = rewriteOp(instr.callee);
                    instr.args = instr.args.map(rewriteOp);
                }
                else if (instr.kind === "GetField") {
                    instr.target = rewriteOp(instr.target);
                }
                else if (instr.kind === "SetField") {
                    instr.target = rewriteOp(instr.target);
                    instr.value = rewriteOp(instr.value);
                }
            }
            if (block.terminator) {
                if (block.terminator.kind === "CondBranch" && block.terminator.cond.kind === "Reg" && copyMap.has(block.terminator.cond.reg)) {
                    block.terminator.cond = { kind: "Reg", reg: copyMap.get(block.terminator.cond.reg) };
                    this.stats.copiesPropagated++;
                    changed = true;
                }
                if (block.terminator.kind === "Return" && block.terminator.value && block.terminator.value.kind === "Reg" && copyMap.has(block.terminator.value.reg)) {
                    block.terminator.value = { kind: "Reg", reg: copyMap.get(block.terminator.value.reg) };
                    this.stats.copiesPropagated++;
                    changed = true;
                }
            }
        }
        return changed;
    }
    /**
     * Pass 3: Algebraic Simplification
     * x + 0 -> x, x - 0 -> x, x * 1 -> x, x * 0 -> 0, x / 1 -> x
     */
    runAlgebraicSimplification(cfg) {
        let changed = false;
        for (const block of cfg.blocks.values()) {
            const newInstructions = [];
            for (const instr of block.instructions) {
                if (instr.kind === "BinOp") {
                    let simplified = null;
                    if (instr.op === "+") {
                        if (instr.left.kind === "Const" && instr.left.value === 0 && instr.right.kind === "Reg") {
                            simplified = { kind: "Copy", dst: instr.dst, src: instr.right };
                        }
                        else if (instr.right.kind === "Const" && instr.right.value === 0 && instr.left.kind === "Reg") {
                            simplified = { kind: "Copy", dst: instr.dst, src: instr.left };
                        }
                    }
                    else if (instr.op === "-") {
                        if (instr.right.kind === "Const" && instr.right.value === 0 && instr.left.kind === "Reg") {
                            simplified = { kind: "Copy", dst: instr.dst, src: instr.left };
                        }
                    }
                    else if (instr.op === "*") {
                        if (instr.left.kind === "Const" && instr.left.value === 1 && instr.right.kind === "Reg") {
                            simplified = { kind: "Copy", dst: instr.dst, src: instr.right };
                        }
                        else if (instr.right.kind === "Const" && instr.right.value === 1 && instr.left.kind === "Reg") {
                            simplified = { kind: "Copy", dst: instr.dst, src: instr.left };
                        }
                        else if ((instr.left.kind === "Const" && instr.left.value === 0) || (instr.right.kind === "Const" && instr.right.value === 0)) {
                            simplified = { kind: "Const", dst: instr.dst, value: 0 };
                        }
                    }
                    else if (instr.op === "/") {
                        if (instr.right.kind === "Const" && instr.right.value === 1 && instr.left.kind === "Reg") {
                            simplified = { kind: "Copy", dst: instr.dst, src: instr.left };
                        }
                    }
                    if (simplified) {
                        newInstructions.push(simplified);
                        this.stats.algebraicSimplifications++;
                        changed = true;
                        continue;
                    }
                }
                newInstructions.push(instr);
            }
            block.instructions = newInstructions;
        }
        return changed;
    }
    /**
     * Pass 4: Common Subexpression Elimination (CSE)
     * Detects duplicate calculations within a block and reuses the earlier result.
     */
    runCommonSubexpressionElimination(cfg) {
        let changed = false;
        for (const block of cfg.blocks.values()) {
            const exprTable = new Map();
            const newInstructions = [];
            for (const instr of block.instructions) {
                if (instr.kind === "BinOp") {
                    // Key for binary expression
                    const opLeft = instr.left.kind === "Reg" ? `%${instr.left.reg}` : `const:${instr.left.value}`;
                    const opRight = instr.right.kind === "Reg" ? `%${instr.right.reg}` : `const:${instr.right.value}`;
                    let exprKey = `${instr.op}:${opLeft}:${opRight}`;
                    // For commutative operations, canonicalize operand order
                    if (["+", "*", "==", "!="].includes(instr.op) && opLeft > opRight) {
                        exprKey = `${instr.op}:${opRight}:${opLeft}`;
                    }
                    if (exprTable.has(exprKey)) {
                        const prevDst = exprTable.get(exprKey);
                        newInstructions.push({ kind: "Copy", dst: instr.dst, src: { kind: "Reg", reg: prevDst } });
                        this.stats.commonSubexpressionsEliminated++;
                        changed = true;
                        continue;
                    }
                    else {
                        exprTable.set(exprKey, instr.dst);
                    }
                }
                newInstructions.push(instr);
            }
            block.instructions = newInstructions;
        }
        return changed;
    }
    propagateOperands(instr, constants) {
        if (instr.kind === "BinOp") {
            if (instr.left.kind === "Reg" && constants.has(instr.left.reg)) {
                instr.left = { kind: "Const", value: constants.get(instr.left.reg) };
                this.stats.propagatedConstants++;
            }
            if (instr.right.kind === "Reg" && constants.has(instr.right.reg)) {
                instr.right = { kind: "Const", value: constants.get(instr.right.reg) };
                this.stats.propagatedConstants++;
            }
        }
        else if (instr.kind === "UnaryOp") {
            if (instr.operand.kind === "Reg" && constants.has(instr.operand.reg)) {
                instr.operand = { kind: "Const", value: constants.get(instr.operand.reg) };
                this.stats.propagatedConstants++;
            }
        }
        else if (instr.kind === "Copy") {
            if (instr.src.kind === "Reg" && constants.has(instr.src.reg)) {
                instr.src = { kind: "Const", value: constants.get(instr.src.reg) };
                this.stats.propagatedConstants++;
            }
        }
    }
    evalBinary(op, a, b) {
        switch (op) {
            case "+":
                return typeof a === "number" && typeof b === "number" ? a + b : String(a) + String(b);
            case "-":
                return typeof a === "number" && typeof b === "number" ? a - b : undefined;
            case "*":
                return typeof a === "number" && typeof b === "number" ? a * b : undefined;
            case "/":
                return typeof a === "number" && typeof b === "number" && b !== 0 ? a / b : undefined;
            case "%":
                return typeof a === "number" && typeof b === "number" && b !== 0 ? a % b : undefined;
            case "<":
                return a < b;
            case "<=":
                return a <= b;
            case ">":
                return a > b;
            case ">=":
                return a >= b;
            case "==":
                return a === b;
            case "!=":
                return a !== b;
            default:
                return undefined;
        }
    }
    evalUnary(op, a) {
        switch (op) {
            case "-":
                return typeof a === "number" ? -a : undefined;
            case "!":
                return !a;
            default:
                return undefined;
        }
    }
    /**
     * Pass 5: Dead Code Elimination (DCE) & Dead Store Elimination
     */
    runDeadCodeElimination(cfg) {
        let changed = false;
        // 1. Gather all referenced registers
        const usedRegisters = new Set();
        for (const block of cfg.blocks.values()) {
            for (const instr of block.instructions) {
                this.collectUsedRegs(instr, usedRegisters);
            }
            if (block.terminator) {
                if (block.terminator.kind === "CondBranch" && block.terminator.cond.kind === "Reg") {
                    usedRegisters.add(block.terminator.cond.reg);
                }
                if (block.terminator.kind === "Return" && block.terminator.value && block.terminator.value.kind === "Reg") {
                    usedRegisters.add(block.terminator.value.reg);
                }
            }
        }
        // 2. Remove instructions whose destination is never used (if no side-effects)
        for (const block of cfg.blocks.values()) {
            block.instructions = block.instructions.filter((instr) => {
                if (instr.kind === "Const" || instr.kind === "BinOp" || instr.kind === "UnaryOp" || instr.kind === "Copy") {
                    if (!usedRegisters.has(instr.dst)) {
                        this.stats.eliminatedInstructions++;
                        changed = true;
                        return false;
                    }
                }
                return true;
            });
        }
        return changed;
    }
    collectUsedRegs(instr, set) {
        if (instr.kind === "BinOp") {
            if (instr.left.kind === "Reg")
                set.add(instr.left.reg);
            if (instr.right.kind === "Reg")
                set.add(instr.right.reg);
        }
        else if (instr.kind === "UnaryOp") {
            if (instr.operand.kind === "Reg")
                set.add(instr.operand.reg);
        }
        else if (instr.kind === "Copy") {
            if (instr.src.kind === "Reg")
                set.add(instr.src.reg);
        }
        else if (instr.kind === "StoreLocal") {
            if (instr.src.kind === "Reg")
                set.add(instr.src.reg);
        }
        else if (instr.kind === "StoreGlobal") {
            if (instr.src.kind === "Reg")
                set.add(instr.src.reg);
        }
        else if (instr.kind === "Call") {
            if (instr.callee.kind === "Reg")
                set.add(instr.callee.reg);
            for (const arg of instr.args) {
                if (arg.kind === "Reg")
                    set.add(arg.reg);
            }
        }
        else if (instr.kind === "GetField") {
            if (instr.target.kind === "Reg")
                set.add(instr.target.reg);
        }
        else if (instr.kind === "SetField") {
            if (instr.target.kind === "Reg")
                set.add(instr.target.reg);
            if (instr.value.kind === "Reg")
                set.add(instr.value.reg);
        }
        else if (instr.kind === "Phi") {
            for (const inc of instr.incoming) {
                if (inc.operand.kind === "Reg")
                    set.add(inc.operand.reg);
            }
        }
        else if (instr.kind === "AllocObject") {
            for (const f of instr.fields) {
                if (f.val.kind === "Reg")
                    set.add(f.val.reg);
            }
        }
        else if (instr.kind === "AllocArray") {
            for (const el of instr.elements) {
                if (el.kind === "Reg")
                    set.add(el.reg);
            }
        }
    }
    /**
     * Pass 6: Jump Threading
     */
    runJumpThreading(cfg) {
        let changed = false;
        for (const block of cfg.blocks.values()) {
            if (block.terminator && block.terminator.kind === "Branch") {
                const targetBlock = cfg.blocks.get(block.terminator.target);
                if (targetBlock && targetBlock.instructions.length === 0 && targetBlock.terminator && targetBlock.terminator.kind === "Branch") {
                    // Thread the jump directly to the target's target
                    block.terminator.target = targetBlock.terminator.target;
                    this.stats.threadedJumps++;
                    changed = true;
                }
            }
        }
        return changed;
    }
    /**
     * Pass 7: Loop Invariant Code Motion (LICM) & Strength Reduction
     */
    runLoopOptimizations(cfg) {
        let changed = false;
        // Detect natural loops via back-edges: an edge from B to Header where Header dominates B
        const dom = cfg.computeDominance();
        const loops = [];
        for (const [bId, block] of cfg.blocks.entries()) {
            for (const succId of block.successors) {
                const domOfB = dom.get(bId);
                if (domOfB && domOfB.has(succId)) {
                    const loopBlocks = new Set();
                    loopBlocks.add(succId);
                    loopBlocks.add(bId);
                    const stack = [bId];
                    while (stack.length > 0) {
                        const curr = stack.pop();
                        const currBlock = cfg.blocks.get(curr);
                        if (!currBlock)
                            continue;
                        for (const pred of currBlock.predecessors) {
                            if (!loopBlocks.has(pred)) {
                                loopBlocks.add(pred);
                                stack.push(pred);
                            }
                        }
                    }
                    loops.push({ headerId: succId, backEdgeId: bId, blocks: loopBlocks });
                }
            }
        }
        // Hoist loop-invariant instructions to loop pre-header
        for (const loop of loops) {
            const header = cfg.blocks.get(loop.headerId);
            if (!header)
                continue;
            let preHeaderId = null;
            for (const predId of header.predecessors) {
                if (!loop.blocks.has(predId)) {
                    preHeaderId = predId;
                    break;
                }
            }
            if (preHeaderId === null)
                continue;
            const preHeader = cfg.blocks.get(preHeaderId);
            if (!preHeader)
                continue;
            const definedInLoop = new Set();
            for (const blockId of loop.blocks) {
                const b = cfg.blocks.get(blockId);
                if (!b)
                    continue;
                for (const instr of b.instructions) {
                    if ("dst" in instr)
                        definedInLoop.add(instr.dst);
                }
            }
            for (const blockId of loop.blocks) {
                if (blockId === loop.headerId)
                    continue;
                const b = cfg.blocks.get(blockId);
                if (!b)
                    continue;
                const remaining = [];
                for (const instr of b.instructions) {
                    let isInvariant = false;
                    if (instr.kind === "BinOp" || instr.kind === "UnaryOp" || instr.kind === "Const") {
                        isInvariant = true;
                        if (instr.kind === "BinOp") {
                            if (instr.left.kind === "Reg" && definedInLoop.has(instr.left.reg))
                                isInvariant = false;
                            if (instr.right.kind === "Reg" && definedInLoop.has(instr.right.reg))
                                isInvariant = false;
                        }
                        else if (instr.kind === "UnaryOp") {
                            if (instr.operand.kind === "Reg" && definedInLoop.has(instr.operand.reg))
                                isInvariant = false;
                        }
                    }
                    if (isInvariant && "dst" in instr) {
                        preHeader.instructions.push(instr);
                        definedInLoop.delete(instr.dst);
                        this.stats.hoistedLoopInvariants++;
                        changed = true;
                    }
                    else {
                        remaining.push(instr);
                    }
                }
                b.instructions = remaining;
            }
        }
        return changed;
    }
    /**
     * Pass 8: Escape Analysis & Scalar Replacement of Aggregates (SROA)
     */
    runEscapeAnalysisAndSROA(cfg) {
        let changed = false;
        const candidates = [];
        for (const [bId, block] of cfg.blocks.entries()) {
            for (let i = 0; i < block.instructions.length; i++) {
                const instr = block.instructions[i];
                if (instr.kind === "AllocObject") {
                    candidates.push({ blockId: bId, instrIndex: i, dst: instr.dst, fields: instr.fields });
                }
            }
        }
        for (const cand of candidates) {
            let escapes = false;
            for (const block of cfg.blocks.values()) {
                for (const instr of block.instructions) {
                    if (instr.kind === "Call") {
                        if (instr.callee.kind === "Reg" && instr.callee.reg === cand.dst)
                            escapes = true;
                        for (const a of instr.args) {
                            if (a.kind === "Reg" && a.reg === cand.dst)
                                escapes = true;
                        }
                    }
                    if (instr.kind === "StoreGlobal" && instr.src.kind === "Reg" && instr.src.reg === cand.dst)
                        escapes = true;
                    if (instr.kind === "StoreLocal" && instr.src.kind === "Reg" && instr.src.reg === cand.dst)
                        escapes = true;
                    if (instr.kind === "SetField" && instr.value.kind === "Reg" && instr.value.reg === cand.dst)
                        escapes = true;
                    if (instr.kind === "AllocObject") {
                        for (const f of instr.fields) {
                            if (f.val.kind === "Reg" && f.val.reg === cand.dst)
                                escapes = true;
                        }
                    }
                    if (instr.kind === "AllocArray") {
                        for (const el of instr.elements) {
                            if (el.kind === "Reg" && el.reg === cand.dst)
                                escapes = true;
                        }
                    }
                }
                if (block.terminator) {
                    if (block.terminator.kind === "Return" && block.terminator.value?.kind === "Reg" && block.terminator.value.reg === cand.dst) {
                        escapes = true;
                    }
                    if (block.terminator.kind === "CondBranch" && block.terminator.cond.kind === "Reg" && block.terminator.cond.reg === cand.dst) {
                        escapes = true;
                    }
                }
                if (escapes)
                    break;
            }
            if (escapes)
                continue;
            // Proven non-escaping: perform Scalar Replacement of Aggregates (SROA)
            const fieldRegMap = new Map();
            const allocBlock = cfg.blocks.get(cand.blockId);
            const initCopies = [];
            for (const field of cand.fields) {
                const fieldVReg = cfg.allocVReg();
                fieldRegMap.set(field.name, fieldVReg);
                initCopies.push({
                    kind: "Copy",
                    dst: fieldVReg,
                    src: field.val,
                    type: field.val.type ?? "any",
                });
            }
            allocBlock.instructions.splice(cand.instrIndex, 1, ...initCopies);
            for (const block of cfg.blocks.values()) {
                for (let i = 0; i < block.instructions.length; i++) {
                    const instr = block.instructions[i];
                    if (instr.kind === "GetField" && instr.target.kind === "Reg" && instr.target.reg === cand.dst) {
                        const fieldVReg = fieldRegMap.get(instr.field);
                        if (fieldVReg !== undefined) {
                            block.instructions[i] = {
                                kind: "Copy",
                                dst: instr.dst,
                                src: { kind: "Reg", reg: fieldVReg },
                                type: instr.type,
                            };
                        }
                    }
                    else if (instr.kind === "SetField" && instr.target.kind === "Reg" && instr.target.reg === cand.dst) {
                        const fieldVReg = fieldRegMap.get(instr.field);
                        if (fieldVReg !== undefined) {
                            block.instructions[i] = {
                                kind: "Copy",
                                dst: fieldVReg,
                                src: instr.value,
                            };
                        }
                    }
                }
            }
            this.stats.scalarReplacements++;
            changed = true;
        }
        return changed;
    }
    /**
     * Pass 9: Controlled Function Inlining
     */
    runFunctionInlining(functions) {
        let changed = false;
        for (const caller of functions.values()) {
            for (const block of caller.cfg.blocks.values()) {
                for (let i = 0; i < block.instructions.length; i++) {
                    const instr = block.instructions[i];
                    if (instr.kind === "Call" && instr.callee.kind === "Const" && typeof instr.callee.value === "string") {
                        const targetName = instr.callee.value;
                        const targetFn = functions.get(targetName);
                        if (!targetFn)
                            continue;
                        if (targetName === caller.name)
                            continue;
                        let isLeaf = true;
                        let totalInst = 0;
                        for (const b of targetFn.cfg.blocks.values()) {
                            totalInst += b.instructions.length;
                            for (const ti of b.instructions) {
                                if (ti.kind === "Call") {
                                    isLeaf = false;
                                    break;
                                }
                            }
                            if (!isLeaf)
                                break;
                        }
                        if (!isLeaf || totalInst > 8)
                            continue;
                        if (targetFn.cfg.blocks.size === 1) {
                            const targetBlock = targetFn.cfg.blocks.get(targetFn.cfg.entryBlockId);
                            if (targetBlock && targetBlock.terminator && targetBlock.terminator.kind === "Return") {
                                const regMap = new Map();
                                for (let pIdx = 0; pIdx < targetFn.params.length; pIdx++) {
                                    if (pIdx < instr.args.length) {
                                        const arg = instr.args[pIdx];
                                        if (arg.kind === "Reg") {
                                            regMap.set(targetFn.params[pIdx], arg.reg);
                                        }
                                    }
                                }
                                const inlinedInstrs = [];
                                for (const targetInstr of targetBlock.instructions) {
                                    if ("dst" in targetInstr) {
                                        const newDst = caller.cfg.allocVReg();
                                        regMap.set(targetInstr.dst, newDst);
                                        if (targetInstr.kind === "BinOp") {
                                            const l = targetInstr.left.kind === "Reg" && regMap.has(targetInstr.left.reg) ? { kind: "Reg", reg: regMap.get(targetInstr.left.reg) } : targetInstr.left;
                                            const r = targetInstr.right.kind === "Reg" && regMap.has(targetInstr.right.reg) ? { kind: "Reg", reg: regMap.get(targetInstr.right.reg) } : targetInstr.right;
                                            inlinedInstrs.push({ kind: "BinOp", dst: newDst, op: targetInstr.op, left: l, right: r, type: targetInstr.type });
                                        }
                                        else if (targetInstr.kind === "Const") {
                                            inlinedInstrs.push({ kind: "Const", dst: newDst, value: targetInstr.value, type: targetInstr.type });
                                        }
                                    }
                                }
                                if (targetBlock.terminator.value) {
                                    const retVal = targetBlock.terminator.value;
                                    const mappedRet = retVal.kind === "Reg" && regMap.has(retVal.reg) ? { kind: "Reg", reg: regMap.get(retVal.reg) } : retVal;
                                    inlinedInstrs.push({ kind: "Copy", dst: instr.dst, src: mappedRet });
                                }
                                block.instructions.splice(i, 1, ...inlinedInstrs);
                                this.stats.inlinedCalls++;
                                changed = true;
                                break;
                            }
                        }
                    }
                }
            }
        }
        return changed;
    }
    /**
     * Pass 10: Branch & Control-Flow Optimization (Hot Fallthrough & Cold Block Placement)
     */
    runBranchAndControlFlowOptimization(cfg) {
        let changed = false;
        for (const block of cfg.blocks.values()) {
            if (block.terminator && block.terminator.kind === "CondBranch") {
                // If condition is a constant boolean, simplify to direct Branch
                if (block.terminator.cond.kind === "Const") {
                    const isTrue = Boolean(block.terminator.cond.value);
                    const chosenTarget = isTrue ? block.terminator.thenTarget : block.terminator.elseTarget;
                    const removedTarget = isTrue ? block.terminator.elseTarget : block.terminator.thenTarget;
                    block.terminator = { kind: "Branch", target: chosenTarget };
                    cfg.removeEdge(block.id, removedTarget);
                    this.stats.reorderedBranches++;
                    changed = true;
                }
            }
        }
        return changed;
    }
    /**
     * Linear Scan Register Allocator over x86_64 Physical Registers
     */
    allocateRegistersLinearScan(cfg) {
        const physicalPool = [
            "RAX", "RDX", "RCX", "RBX", "RSI", "RDI",
            "R8", "R9", "R10", "R11", "R12", "R13", "R14", "R15"
        ];
        // 1. Assign linear indices to all instructions in CFG order
        let linearIdx = 0;
        const intervals = new Map();
        const recordUse = (vreg, idx) => {
            let interval = intervals.get(vreg);
            if (!interval) {
                interval = { vreg, start: idx, end: idx };
                intervals.set(vreg, interval);
            }
            else {
                interval.end = Math.max(interval.end, idx);
            }
        };
        const recordDef = (vreg, idx) => {
            let interval = intervals.get(vreg);
            if (!interval) {
                interval = { vreg, start: idx, end: idx };
                intervals.set(vreg, interval);
            }
            else {
                interval.start = Math.min(interval.start, idx);
            }
        };
        for (const block of cfg.blocks.values()) {
            for (const instr of block.instructions) {
                if ("dst" in instr)
                    recordDef(instr.dst, linearIdx);
                const used = new Set();
                this.collectUsedRegs(instr, used);
                for (const u of used)
                    recordUse(u, linearIdx);
                linearIdx++;
            }
            if (block.terminator) {
                if (block.terminator.kind === "CondBranch" && block.terminator.cond.kind === "Reg") {
                    recordUse(block.terminator.cond.reg, linearIdx);
                }
                else if (block.terminator.kind === "Return" && block.terminator.value?.kind === "Reg") {
                    recordUse(block.terminator.value.reg, linearIdx);
                }
                linearIdx++;
            }
        }
        // 2. Sort intervals by start index
        const sortedIntervals = Array.from(intervals.values()).sort((a, b) => a.start - b.start);
        const active = [];
        const allocation = new Map();
        const freeRegs = new Set(physicalPool);
        let nextSpillSlot = 0;
        // 3. Linear scan allocation
        for (const current of sortedIntervals) {
            // Expire old intervals
            for (let i = active.length - 1; i >= 0; i--) {
                if (active[i].end < current.start) {
                    freeRegs.add(active[i].physReg);
                    active.splice(i, 1);
                }
            }
            // Check available physical register
            if (freeRegs.size > 0) {
                const assignedReg = freeRegs.values().next().value;
                freeRegs.delete(assignedReg);
                active.push({ ...current, physReg: assignedReg });
                allocation.set(current.vreg, { physReg: assignedReg });
            }
            else {
                // Spill the interval that ends latest
                const latest = active.reduce((max, item) => item.end > max.end ? item : max, active[0]);
                if (latest && latest.end > current.end) {
                    // Spill latest active
                    freeRegs.add(latest.physReg);
                    allocation.set(latest.vreg, { spillSlot: nextSpillSlot++ });
                    const idx = active.indexOf(latest);
                    if (idx !== -1)
                        active.splice(idx, 1);
                    // Assign freed register to current
                    const assignedReg = freeRegs.values().next().value;
                    freeRegs.delete(assignedReg);
                    active.push({ ...current, physReg: assignedReg });
                    allocation.set(current.vreg, { physReg: assignedReg });
                }
                else {
                    // Spill current
                    allocation.set(current.vreg, { spillSlot: nextSpillSlot++ });
                }
            }
        }
        return allocation;
    }
}
exports.MIROptimizer = MIROptimizer;
//# sourceMappingURL=optimizer.js.map