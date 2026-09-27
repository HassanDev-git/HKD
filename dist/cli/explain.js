"use strict";
/**
 * HKD Explain Tool
 *
 * Provides detailed compiler explanations and corrective guidance for HKD error codes.
 * Invoked via: hkd explain <error_code>
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERROR_EXPLANATIONS = void 0;
exports.explainError = explainError;
exports.ERROR_EXPLANATIONS = {
    E101: {
        code: "E101",
        title: "Invalid Character",
        category: "Lexer",
        summary: "The scanner encountered a character that is not valid in HKD source code.",
        erroneousExample: `let x = @123;`,
        fixedExample: `let x = 123;`,
        notes: ["HKD source files must be encoded in valid UTF-8."],
    },
    E102: {
        code: "E102",
        title: "Unterminated String Literal",
        category: "Lexer",
        summary: "A string literal was started with a quote but never closed before the line ended or EOF was reached.",
        erroneousExample: `let greeting = "Hello world;`,
        fixedExample: `let greeting = "Hello world";`,
    },
    E103: {
        code: "E103",
        title: "Unterminated Block Comment",
        category: "Lexer",
        summary: "A multi-line block comment `/* ... */` was opened but never closed.",
        erroneousExample: `/* This comment is never closed
let x = 10;`,
        fixedExample: `/* This comment is properly closed */
let x = 10;`,
    },
    E104: {
        code: "E104",
        title: "Invalid Number Literal",
        category: "Lexer",
        summary: "A numeric literal has invalid digits, multiple decimal points, or improper hexadecimal/binary prefixes.",
        erroneousExample: `let num = 12.34.56;`,
        fixedExample: `let num = 12.34;`,
    },
    E105: {
        code: "E105",
        title: "Invalid Escape Sequence",
        category: "Lexer",
        summary: "An escape sequence in a string literal contains an unknown escape character.",
        erroneousExample: `let s = "bad escape \\q";`,
        fixedExample: `let s = "valid newline \\n";`,
    },
    E201: {
        code: "E201",
        title: "Unexpected Token / Feature Gated",
        category: "Parser",
        summary: "The parser encountered a token where it was not expected, or a language evolution feature (like generics `<T>` or `match`) was used without being enabled via `#feature(...)` or `edition = \"2027\"`.",
        erroneousExample: `// In Edition 2026 without feature flag:
match val {
    1 => "one",
    _ => "other"
}`,
        fixedExample: `#feature(pattern_matching)
match val {
    1 => "one",
    _ => "other"
}`,
        notes: [
            "To enable all HKD 1.1 features globally, configure `edition = \"2027\"` in `hkd.toml`.",
            "For file-level enablement in Edition 2026, place `#feature(...)` at the top of the file.",
        ],
    },
    E202: {
        code: "E202",
        title: "Expected Token Not Found",
        category: "Parser",
        summary: "The grammar expected a specific token (such as a closing parenthesis, brace, or identifier) that was missing.",
        erroneousExample: `fn add(a: Int, b: Int -> Int { return a + b; }`,
        fixedExample: `fn add(a: Int, b: Int) -> Int { return a + b; }`,
    },
    E203: {
        code: "E203",
        title: "Unexpected End of File",
        category: "Parser",
        summary: "The input ended abruptly while the parser was still expecting additional tokens to complete an open construct.",
        erroneousExample: `fn incomplete() {`,
        fixedExample: `fn incomplete() {\n}`,
    },
    E204: {
        code: "E204",
        title: "Invalid Expression",
        category: "Parser",
        summary: "The parser encountered an expression structure that violates grammatical rules.",
        erroneousExample: `let x = + * 5;`,
        fixedExample: `let x = 5;`,
    },
    E205: {
        code: "E205",
        title: "Invalid Assignment Target",
        category: "Parser",
        summary: "The left-hand side of an assignment is not an assignable location (lvalue).",
        erroneousExample: `5 = x;`,
        fixedExample: `x = 5;`,
    },
    E206: {
        code: "E206",
        title: "Missing Closing Delimiter",
        category: "Parser",
        summary: "An opened bracket `[`, parenthesis `(`, or brace `{` was never closed.",
        erroneousExample: `let arr = [1, 2, 3;`,
        fixedExample: `let arr = [1, 2, 3];`,
    },
    E301: {
        code: "E301",
        title: "Undefined Variable / Identifier",
        category: "Semantic",
        summary: "An identifier was referenced that has not been declared in the current or any enclosing scope, or is an unimported standard library symbol.",
        erroneousExample: `let result = sqrt(16);`,
        fixedExample: `import math
let result = math.sqrt(16);`,
        notes: [
            "If the symbol is part of the standard library (e.g. `sqrt`, `read_file`, `stringify`), import the corresponding module (`import math`, `import fs`, `import json`).",
            "If the module is already imported, access the symbol via member syntax (e.g. `math.sqrt`).",
            "If the identifier was mistyped, check the 'Did you mean ...?' suggestion provided by the compiler.",
        ],
    },
    E302: {
        code: "E302",
        title: "Undefined Function",
        category: "Semantic",
        summary: "A function was called that does not exist in scope or standard library imports.",
        erroneousExample: `missing_fn();`,
        fixedExample: `fn missing_fn() { }
missing_fn();`,
    },
    E303: {
        code: "E303",
        title: "Type Mismatch",
        category: "Semantic",
        summary: "An expression's type is incompatible with the expected type for this context.",
        erroneousExample: `let x: Int = "hello";`,
        fixedExample: `let x: String = "hello";`,
        notes: [
            "HKD validates types statically during semantic analysis.",
            "For structs, ensure all expected fields exist and field types match structurally.",
            "For arrays, ensure element types match the declared array element type.",
            "For functions, verify parameter count (arity), parameter types, and return types.",
            "For generic functions or types, ensure type parameters can be unified with the concrete types.",
        ],
    },
    E304: {
        code: "E304",
        title: "Redeclaration of Identifier",
        category: "Semantic",
        summary: "An identifier was declared more than once in the same scope without shadowing rules.",
        erroneousExample: `let x = 1;
let x = 2;`,
        fixedExample: `let x = 1;
x = 2;`,
    },
    E305: {
        code: "E305",
        title: "Return Outside Function",
        category: "Semantic",
        summary: "A `return` statement was used at the top level or outside any function declaration.",
        erroneousExample: `let x = 10;
return x;`,
        fixedExample: `fn compute() -> Int {
    let x = 10;
    return x;
}`,
    },
    E306: {
        code: "E306",
        title: "Break/Continue Outside Loop",
        category: "Semantic",
        summary: "`break` or `continue` occurred outside of a `while` or `for` loop.",
        erroneousExample: `if true {
    break;
}`,
        fixedExample: `while true {
    break;
}`,
    },
    E307: {
        code: "E307",
        title: "Wrong Argument Count",
        category: "Semantic",
        summary: "A function was called with fewer or more arguments than declared in its signature.",
        erroneousExample: `fn add(a: Int, b: Int) -> Int { return a + b; }
add(1);`,
        fixedExample: `add(1, 2);`,
    },
    E308: {
        code: "E308",
        title: "Undefined Type",
        category: "Semantic",
        summary: "A type annotation references a type name that is not built-in, a struct, or in scope.",
        erroneousExample: `let user: NonExistentUser = null;`,
        fixedExample: `struct NonExistentUser { id: Int }
let user: NonExistentUser = NonExistentUser { id: 1 };`,
    },
    E309: {
        code: "E309",
        title: "Undefined Struct Field",
        category: "Semantic",
        summary: "An access or initialization referenced a struct field that does not exist in the struct definition.",
        erroneousExample: `struct Point { x: Int, y: Int }
let p = Point { x: 1, y: 2, z: 3 };`,
        fixedExample: `let p = Point { x: 1, y: 2 };`,
    },
    E401: {
        code: "E401",
        title: "Division by Zero",
        category: "Runtime",
        summary: "An integer or floating point division by zero occurred at runtime.",
        erroneousExample: `let x = 10 / 0;`,
        fixedExample: `let denom = 2;
let x = denom != 0 ? (10 / denom) : 0;`,
    },
    E402: {
        code: "E402",
        title: "Index Out of Bounds",
        category: "Runtime",
        summary: "An array was indexed with a negative index or an index greater than or equal to its length.",
        erroneousExample: `let arr = [1, 2];
let x = arr[5];`,
        fixedExample: `let idx = 1;
let x = idx < len(arr) ? arr[idx] : null;`,
    },
    E403: {
        code: "E403",
        title: "Null Reference Exception",
        category: "Runtime",
        summary: "An operation or field access was attempted on a null value.",
        erroneousExample: `let obj = null;
let val = obj.field;`,
        fixedExample: `let val = obj?.field;`,
    },
    E405: {
        code: "E405",
        title: "Invalid Operation",
        category: "Runtime",
        summary: "A runtime operation is invalid for the operands (e.g. calling `Result.unwrap()` on an `Err` result).",
        erroneousExample: `import result
let r = result.err("disk failure");
let data = result.unwrap(r);`,
        fixedExample: `let data = result.unwrap_or(r, "default");`,
    },
    E406: {
        code: "E406",
        title: "Import Not Found",
        category: "Runtime",
        summary: "A module could not be found in the stdlib, project dependencies, or relative file paths.",
        erroneousExample: `import non_existent_pkg`,
        fixedExample: `import math`,
    },
    E408: {
        code: "E408",
        title: "Not Callable",
        category: "Runtime",
        summary: "An expression was called with `(...)` but is not a function, closure, or native function.",
        erroneousExample: `let x = 42;
x();`,
        fixedExample: `let x = fn() { return 42; };
x();`,
    },
    E501: {
        code: "E501",
        title: "Invalid Bytecode",
        category: "VM",
        summary: "The virtual machine loaded an opcode stream with invalid instructions, corrupted magic numbers, or broken constants.",
        erroneousExample: `// Loading a corrupted .hkdc file`,
        fixedExample: `// Recompile the file using \`hkd compile\``,
    },
    E601: {
        code: "E601",
        title: "Package Not Found",
        category: "Package",
        summary: "The package manager could not find the requested package in local cache or registry.",
        erroneousExample: `hkd add non_existent_package_12345`,
        fixedExample: `hkd add collections-extra`,
    },
};
function explainError(codeOrInput) {
    const normalized = codeOrInput.toUpperCase().trim();
    const explanation = exports.ERROR_EXPLANATIONS[normalized];
    if (!explanation) {
        const validCodes = Object.keys(exports.ERROR_EXPLANATIONS).join(", ");
        return `Error code \`${codeOrInput}\` not found in the HKD explanation index.\n\nAvailable codes:\n${validCodes}\n\nUse: hkd explain <error_code>`;
    }
    const lines = [
        `=== HKD Error Explanation: [${explanation.code}] ${explanation.title} ===`,
        `Category: ${explanation.category}`,
        ``,
        `Summary:`,
        `  ${explanation.summary}`,
        ``,
        `Erroneous Code Example:`,
        explanation.erroneousExample
            .split("\n")
            .map((l) => `  ${l}`)
            .join("\n"),
        ``,
        `Corrected Code Example:`,
        explanation.fixedExample
            .split("\n")
            .map((l) => `  ${l}`)
            .join("\n"),
    ];
    if (explanation.notes && explanation.notes.length > 0) {
        lines.push(``, `Guidance & Options:`);
        for (const note of explanation.notes) {
            lines.push(`  * ${note}`);
        }
    }
    lines.push(``, `Learn more at https://hkd-lang.org/docs/errors/${explanation.code.toLowerCase()}`);
    return lines.join("\n");
}
//# sourceMappingURL=explain.js.map