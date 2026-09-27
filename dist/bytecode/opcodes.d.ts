/**
 * HKD Bytecode Opcode Definitions
 *
 * Each opcode is a single byte (0–255).
 * The VM interprets a flat Uint8Array of opcodes + inline operands.
 *
 * Operand encoding:
 *   Most operands are 2-byte unsigned integers (big-endian).
 *   Jump offsets are signed 2-byte integers (big-endian, relative to end of jump instruction).
 */
export declare const enum Op {
    /** Push constant pool entry at index (u16) */
    LoadConst = 1,
    /** Push null */
    LoadNull = 2,
    /** Push true */
    LoadTrue = 3,
    /** Push false */
    LoadFalse = 4,
    /** Pop top of stack */
    Pop = 5,
    /** Duplicate top of stack */
    Dup = 6,
    /** Load local variable at slot (u16) */
    LoadLocal = 16,
    /** Store TOS into local at slot (u16) */
    StoreLocal = 17,
    /** Define local (alloc slot, store TOS) */
    DefineLocal = 18,
    /** Load global by name index (u16 into constant pool) */
    LoadGlobal = 19,
    /** Store TOS into global by name index (u16) */
    StoreGlobal = 20,
    /** Define global by name index (u16) */
    DefineGlobal = 21,
    LoadUpvalue = 22,
    StoreUpvalue = 23,
    CloseUpvalue = 24,
    Add = 32,
    Sub = 33,
    Mul = 34,
    Div = 35,
    Mod = 36,
    Pow = 37,
    Neg = 38,
    Eq = 48,
    Ne = 49,
    Lt = 50,
    Le = 51,
    Gt = 52,
    Ge = 53,
    Not = 64,
    BitAnd = 65,
    BitOr = 66,
    BitXor = 67,
    BitNot = 68,
    Shl = 69,
    Shr = 70,
    /** Unconditional jump; offset i16 */
    Jump = 80,
    /** Jump if TOS is falsy; offset i16 */
    JumpFalse = 81,
    /** Jump if TOS is truthy (short-circuit &&); offset i16 */
    JumpTrue = 82,
    /** Jump if TOS is null; offset i16 */
    JumpNull = 83,
    /** Call function: argc (u8) */
    Call = 96,
    /** Return from function */
    Return = 97,
    /** Make closure from function at const index (u16); upvalue_count (u8) */
    MakeClosure = 98,
    /** Make array from top N stack values; N = u16 */
    MakeArray = 112,
    /** Load element: array[index] (both on stack) */
    GetIndex = 113,
    /** Store element: array[index] = value (all on stack) */
    SetIndex = 114,
    /** Push array.length */
    ArrayLen = 115,
    /** Make object from N key-value pairs on stack; N = u16 */
    MakeObject = 128,
    /** Get field by name (const index u16) */
    GetField = 129,
    /** Set field by name (const index u16); value on TOS, obj below */
    SetField = 130,
    /** Push iterator from TOS */
    MakeIter = 144,
    /** Advance iterator; push next value or jump if done; offset i16 */
    IterNext = 145,
    /** String concatenation (n u16 values) */
    Concat = 160,
    /** Emit debug info: line number u16 */
    LineInfo = 240,
    /** Halt the VM */
    Halt = 255
}
/** Human-readable opcode names for disassembly. */
export declare const OP_NAMES: Record<number, string>;
//# sourceMappingURL=opcodes.d.ts.map