pub const Op = enum(u8) {
    LoadConst    = 0x01,
    LoadNull     = 0x02,
    LoadTrue     = 0x03,
    LoadFalse    = 0x04,
    Pop          = 0x05,
    Dup          = 0x06,

    LoadLocal    = 0x10,
    StoreLocal   = 0x11,
    DefineLocal  = 0x12,

    LoadGlobal   = 0x13,
    StoreGlobal  = 0x14,
    DefineGlobal = 0x15,

    LoadUpvalue  = 0x16,
    StoreUpvalue = 0x17,
    CloseUpvalue = 0x18,

    Add          = 0x20,
    Sub          = 0x21,
    Mul          = 0x22,
    Div          = 0x23,
    Mod          = 0x24,
    Pow          = 0x25,
    Neg          = 0x26,

    Eq           = 0x30,
    Ne           = 0x31,
    Lt           = 0x32,
    Le           = 0x33,
    Gt           = 0x34,
    Ge           = 0x35,

    Not          = 0x40,
    BitAnd       = 0x41,
    BitOr        = 0x42,
    BitXor       = 0x43,
    BitNot       = 0x44,
    Shl          = 0x45,
    Shr          = 0x46,

    Jump         = 0x50,
    JumpFalse    = 0x51,
    JumpTrue     = 0x52,
    JumpNull     = 0x53,

    Call         = 0x60,
    Return       = 0x61,
    MakeClosure  = 0x62,

    MakeArray    = 0x70,
    GetIndex     = 0x71,
    SetIndex     = 0x72,
    ArrayLen     = 0x73,

    MakeObject   = 0x80,
    GetField     = 0x81,
    SetField     = 0x82,

    MakeIter     = 0x90,
    IterNext     = 0x91,

    Concat       = 0xA0,

    LineInfo     = 0xF0,
    Halt         = 0xFF,
};
