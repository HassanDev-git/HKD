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

export const enum Op {
  // ── Stack ────────────────────────────────────────────────────────────────
  /** Push constant pool entry at index (u16) */
  LoadConst    = 0x01,
  /** Push null */
  LoadNull     = 0x02,
  /** Push true */
  LoadTrue     = 0x03,
  /** Push false */
  LoadFalse    = 0x04,
  /** Pop top of stack */
  Pop          = 0x05,
  /** Duplicate top of stack */
  Dup          = 0x06,

  // ── Locals ───────────────────────────────────────────────────────────────
  /** Load local variable at slot (u16) */
  LoadLocal    = 0x10,
  /** Store TOS into local at slot (u16) */
  StoreLocal   = 0x11,
  /** Define local (alloc slot, store TOS) */
  DefineLocal  = 0x12,

  // ── Globals ──────────────────────────────────────────────────────────────
  /** Load global by name index (u16 into constant pool) */
  LoadGlobal   = 0x13,
  /** Store TOS into global by name index (u16) */
  StoreGlobal  = 0x14,
  /** Define global by name index (u16) */
  DefineGlobal = 0x15,

  // ── Upvalues (closures) ───────────────────────────────────────────────────
  LoadUpvalue  = 0x16,
  StoreUpvalue = 0x17,
  CloseUpvalue = 0x18,

  // ── Arithmetic ───────────────────────────────────────────────────────────
  Add          = 0x20,
  Sub          = 0x21,
  Mul          = 0x22,
  Div          = 0x23,
  Mod          = 0x24,
  Pow          = 0x25,
  Neg          = 0x26,

  // ── Comparison ───────────────────────────────────────────────────────────
  Eq           = 0x30,
  Ne           = 0x31,
  Lt           = 0x32,
  Le           = 0x33,
  Gt           = 0x34,
  Ge           = 0x35,

  // ── Logical ──────────────────────────────────────────────────────────────
  Not          = 0x40,

  // ── Bitwise ──────────────────────────────────────────────────────────────
  BitAnd       = 0x41,
  BitOr        = 0x42,
  BitXor       = 0x43,
  BitNot       = 0x44,
  Shl          = 0x45,
  Shr          = 0x46,

  // ── Jumps ────────────────────────────────────────────────────────────────
  /** Unconditional jump; offset i16 */
  Jump         = 0x50,
  /** Jump if TOS is falsy; offset i16 */
  JumpFalse    = 0x51,
  /** Jump if TOS is truthy (short-circuit &&); offset i16 */
  JumpTrue     = 0x52,
  /** Jump if TOS is null; offset i16 */
  JumpNull     = 0x53,

  // ── Functions ────────────────────────────────────────────────────────────
  /** Call function: argc (u8) */
  Call         = 0x60,
  /** Return from function */
  Return       = 0x61,
  /** Make closure from function at const index (u16); upvalue_count (u8) */
  MakeClosure  = 0x62,

  // ── Arrays ───────────────────────────────────────────────────────────────
  /** Make array from top N stack values; N = u16 */
  MakeArray    = 0x70,
  /** Load element: array[index] (both on stack) */
  GetIndex     = 0x71,
  /** Store element: array[index] = value (all on stack) */
  SetIndex     = 0x72,
  /** Push array.length */
  ArrayLen     = 0x73,

  // ── Objects ──────────────────────────────────────────────────────────────
  /** Make object from N key-value pairs on stack; N = u16 */
  MakeObject   = 0x80,
  /** Get field by name (const index u16) */
  GetField     = 0x81,
  /** Set field by name (const index u16); value on TOS, obj below */
  SetField     = 0x82,

  // ── Iteration ────────────────────────────────────────────────────────────
  /** Push iterator from TOS */
  MakeIter     = 0x90,
  /** Advance iterator; push next value or jump if done; offset i16 */
  IterNext     = 0x91,

  // ── String ───────────────────────────────────────────────────────────────
  /** String concatenation (n u16 values) */
  Concat       = 0xA0,

  // ── Debug ────────────────────────────────────────────────────────────────
  /** Emit debug info: line number u16 */
  LineInfo     = 0xF0,
  /** Halt the VM */
  Halt         = 0xFF,
}

/** Human-readable opcode names for disassembly. */
export const OP_NAMES: Record<number, string> = {
  [Op.LoadConst]:    "LOAD_CONST",
  [Op.LoadNull]:     "LOAD_NULL",
  [Op.LoadTrue]:     "LOAD_TRUE",
  [Op.LoadFalse]:    "LOAD_FALSE",
  [Op.Pop]:          "POP",
  [Op.Dup]:          "DUP",
  [Op.LoadLocal]:    "LOAD_LOCAL",
  [Op.StoreLocal]:   "STORE_LOCAL",
  [Op.DefineLocal]:  "DEFINE_LOCAL",
  [Op.LoadGlobal]:   "LOAD_GLOBAL",
  [Op.StoreGlobal]:  "STORE_GLOBAL",
  [Op.DefineGlobal]: "DEFINE_GLOBAL",
  [Op.LoadUpvalue]:  "LOAD_UPVALUE",
  [Op.StoreUpvalue]: "STORE_UPVALUE",
  [Op.CloseUpvalue]: "CLOSE_UPVALUE",
  [Op.Add]:          "ADD",
  [Op.Sub]:          "SUB",
  [Op.Mul]:          "MUL",
  [Op.Div]:          "DIV",
  [Op.Mod]:          "MOD",
  [Op.Pow]:          "POW",
  [Op.Neg]:          "NEG",
  [Op.Eq]:           "EQ",
  [Op.Ne]:           "NE",
  [Op.Lt]:           "LT",
  [Op.Le]:           "LE",
  [Op.Gt]:           "GT",
  [Op.Ge]:           "GE",
  [Op.Not]:          "NOT",
  [Op.BitAnd]:       "BIT_AND",
  [Op.BitOr]:        "BIT_OR",
  [Op.BitXor]:       "BIT_XOR",
  [Op.BitNot]:       "BIT_NOT",
  [Op.Shl]:          "SHL",
  [Op.Shr]:          "SHR",
  [Op.Jump]:         "JUMP",
  [Op.JumpFalse]:    "JUMP_FALSE",
  [Op.JumpTrue]:     "JUMP_TRUE",
  [Op.JumpNull]:     "JUMP_NULL",
  [Op.Call]:         "CALL",
  [Op.Return]:       "RETURN",
  [Op.MakeClosure]:  "MAKE_CLOSURE",
  [Op.MakeArray]:    "MAKE_ARRAY",
  [Op.GetIndex]:     "GET_INDEX",
  [Op.SetIndex]:     "SET_INDEX",
  [Op.ArrayLen]:     "ARRAY_LEN",
  [Op.MakeObject]:   "MAKE_OBJECT",
  [Op.GetField]:     "GET_FIELD",
  [Op.SetField]:     "SET_FIELD",
  [Op.MakeIter]:     "MAKE_ITER",
  [Op.IterNext]:     "ITER_NEXT",
  [Op.Concat]:       "CONCAT",
  [Op.LineInfo]:     "LINE_INFO",
  [Op.Halt]:         "HALT",
};
