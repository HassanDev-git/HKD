# HKD Diagnostic & Error Codes Catalogue

## 1. Lexer Errors (E101–E199)
- `E101`: Invalid Character — The scanner encountered a byte not allowed in source text.
- `E102`: Unterminated String — A string literal was not closed before end of line or file.
- `E103`: Unterminated Block Comment — A `/*` comment was never closed with `*/`.
- `E104`: Invalid Number Literal — Malformed numeric constant or floating-point exponent.
- `E105`: Invalid Escape Sequence — Unrecognized character escape sequence in string literal.

---

## 2. Parser Errors (E201–E299)
- `E201`: Unexpected Token — Token encountered that violates grammatical structure.
- `E202`: Expected Token Not Found — Missing semicolon, brace, identifier, or keyword.
- `E203`: Unexpected End of File — Input stream terminated prematurely.
- `E204`: Invalid Expression — Malformed syntax in expression.
- `E205`: Invalid Assignment Target — LHS of assignment is not an lvalue.
- `E206`: Missing Closing Delimiter — Unmatched parentheses `()`, brackets `[]`, or braces `{}`.

---

## 3. Semantic & Type Errors (E301–E399)
- `E301`: Undefined Variable / Identifier — Identifier used before declaration in current scope. In HKD 1.2+, automatically suggests relevant standard library imports (e.g., `import math` for `sqrt`, or `math.sqrt` if already imported) and offers Levenshtein-distance typo hints.
- `E302`: Undefined Function — Attempted call of undeclared function name.
- `E303`: Type Mismatch — Type of value does not match expected parameter/variable type. In HKD 1.2+, provides rich contextual diffs: struct missing/mismatched fields, array element mismatches, function arity/param diffs, and generic type parameter unification details.
- `E304`: Redeclaration — Identifier already declared in the same scope depth.
- `E305`: Return Outside Function — `return` statement found in top-level script scope.
- `E306`: Break/Continue Outside Loop — Loop control statement used outside `while` or `for`.
- `E307`: Wrong Argument Count — Arity mismatch between function call and declaration.
- `E308`: Undefined Type — Type annotation references unrecognized type name.
- `E309`: Constant Reassignment — Attempted assignment to a `const` variable.
- `E310`: Struct Field Mismatch — Unknown struct field or missing required field.
- `E311`: Cannot Call Non-Callable — Attempted invocation of non-function value.
- `E312`: Cannot Access Member on Non-Object — Property access on primitive.

---

## 4. Runtime Panics (E401–E499)
- `E401`: Index Out of Bounds — Array index is negative or $\ge$ length.
- `E402`: Key Not Found — Object field does not exist.
- `E403`: Division by Zero — Integer division by zero.
- `E404`: Stack Overflow — Maximum recursion call depth exceeded.
- `E405`: Type Cast Failure — Dynamic value cannot be converted to target type.
- `E406`: Module Not Found — Failed to resolve imported module path.
- `E407`: Assertion Failed — Assertion condition evaluated to false.
