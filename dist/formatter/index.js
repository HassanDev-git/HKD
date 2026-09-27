"use strict";
/**
 * HKD Formatter (hkd fmt)
 *
 * Pretty-prints an HKD AST back to canonical source code.
 * Output is deterministic — same AST always produces same output.
 *
 * Rules:
 *   - 4-space indentation
 *   - Space around binary operators
 *   - Space after commas
 *   - Opening braces on same line
 *   - Blank line between top-level declarations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Formatter = void 0;
exports.formatSource = formatSource;
exports.format = format;
// ─── Formatter ────────────────────────────────────────────────────────────────
class Formatter {
    indent = 0;
    INDENT_SIZE = 4;
    format(program) {
        const parts = [];
        for (let i = 0; i < program.statements.length; i++) {
            const stmt = program.statements[i];
            parts.push(this.formatStmt(stmt));
        }
        return parts.join("\n") + "\n";
    }
    // ── Statements ─────────────────────────────────────────────────────────────
    formatStmt(stmt) {
        switch (stmt.kind) {
            case "VarDeclStmt": return this.fmtVarDecl(stmt);
            case "ConstDeclStmt": return this.fmtConstDecl(stmt);
            case "FunctionDeclStmt": return this.fmtFunctionDecl(stmt);
            case "StructDeclStmt": return this.fmtStructDecl(stmt);
            case "ImplBlockStmt": return this.fmtImpl(stmt);
            case "TraitDeclStmt": return this.fmtTraitDecl(stmt);
            case "TypeAliasStmt": return this.fmtTypeAlias(stmt);
            case "ReturnStmt": return this.fmtReturn(stmt);
            case "BreakStmt": return this.ind("break");
            case "ContinueStmt": return this.ind("continue");
            case "IfStmt": return this.fmtIf(stmt);
            case "WhileStmt": return this.fmtWhile(stmt);
            case "ForStmt": return this.fmtFor(stmt);
            case "BlockStmt": return this.fmtBlock(stmt);
            case "ExprStmt": return this.ind(this.fmtExpr(stmt.expr));
            case "ImportStmt": return this.fmtImport(stmt);
            case "ExportStmt": return `${this.ind("export")} ${this.formatStmt(stmt.declaration).trimStart()}`;
            case "TestStmt": return this.fmtTest(stmt);
            case "AssertStmt": return this.fmtAssert(stmt);
        }
    }
    fmtVarDecl(s) {
        let result = `let ${s.name}`;
        if (s.typeAnnotation)
            result += `: ${this.fmtType(s.typeAnnotation)}`;
        if (s.initializer)
            result += ` = ${this.fmtExpr(s.initializer)}`;
        return this.ind(result);
    }
    fmtConstDecl(s) {
        let result = `const ${s.name}`;
        if (s.typeAnnotation)
            result += `: ${this.fmtType(s.typeAnnotation)}`;
        result += ` = ${this.fmtExpr(s.initializer)}`;
        return this.ind(result);
    }
    fmtFunctionDecl(s) {
        const prefix = s.isAsync ? "async " : "";
        const tp = s.typeParams && s.typeParams.length > 0 ? `<${s.typeParams.join(", ")}>` : "";
        const params = s.params.map((p) => this.fmtParam(p)).join(", ");
        let sig = `${prefix}fn ${s.name}${tp}(${params})`;
        if (s.returnType)
            sig += ` -> ${this.fmtType(s.returnType)}`;
        return this.ind(`${sig} ${this.fmtBlock(s.body).trimStart()}`);
    }
    fmtParam(p) {
        let s = p.name;
        if (p.typeAnnotation)
            s += `: ${this.fmtType(p.typeAnnotation)}`;
        if (p.defaultValue)
            s += ` = ${this.fmtExpr(p.defaultValue)}`;
        return s;
    }
    fmtStructDecl(s) {
        const fields = s.fields.map((f) => {
            let line = `${" ".repeat((this.indent + 1) * this.INDENT_SIZE)}${f.name}: ${this.fmtType(f.typeAnnotation)}`;
            if (f.defaultValue)
                line += ` = ${this.fmtExpr(f.defaultValue)}`;
            return line;
        });
        const body = fields.length > 0 ? "\n" + fields.join("\n") + "\n" + this.indStr() : "";
        return this.ind(`struct ${s.name} {${body}}`);
    }
    fmtImpl(s) {
        this.indent++;
        const methods = s.methods.map((m) => this.fmtFunctionDecl(m)).join("\n\n");
        this.indent--;
        const body = s.methods.length > 0 ? "\n" + methods + "\n" + this.indStr() : "";
        const header = s.traitName ? `impl ${s.traitName} for ${s.structName}` : `impl ${s.structName}`;
        return this.ind(`${header} {${body}}`);
    }
    fmtTraitDecl(s) {
        this.indent++;
        const methods = s.methods.map((m) => {
            const params = m.params.map((p) => {
                let r = p.name;
                if (p.typeAnnotation)
                    r += `: ${this.fmtType(p.typeAnnotation)}`;
                return r;
            }).join(", ");
            let ret = "";
            if (m.returnType)
                ret = ` -> ${this.fmtType(m.returnType)}`;
            return this.ind(`fn ${m.name}(${params})${ret}`);
        }).join("\n");
        this.indent--;
        const body = s.methods.length > 0 ? "\n" + methods + "\n" + this.indStr() : "";
        return this.ind(`trait ${s.name} {${body}}`);
    }
    fmtTypeAlias(s) {
        return this.ind(`type ${s.name} = ${this.fmtType(s.typeExpr)}`);
    }
    fmtReturn(s) {
        if (s.value)
            return this.ind(`return ${this.fmtExpr(s.value)}`);
        return this.ind("return");
    }
    fmtIf(s) {
        let result = this.ind(`if ${this.fmtExpr(s.condition)} ${this.fmtBlock(s.then).trimStart()}`);
        if (s.else_) {
            if (s.else_.kind === "IfStmt") {
                result += ` else ${this.fmtIf(s.else_).trimStart()}`;
            }
            else {
                result += ` else ${this.fmtBlock(s.else_).trimStart()}`;
            }
        }
        return result;
    }
    fmtWhile(s) {
        return this.ind(`while ${this.fmtExpr(s.condition)} ${this.fmtBlock(s.body).trimStart()}`);
    }
    fmtFor(s) {
        return this.ind(`for ${s.variable} in ${this.fmtExpr(s.iterable)} ${this.fmtBlock(s.body).trimStart()}`);
    }
    fmtBlock(s) {
        if (s.body.length === 0)
            return this.ind("{}");
        this.indent++;
        const body = s.body.map((stmt) => this.formatStmt(stmt)).join("\n");
        this.indent--;
        return this.ind(`{\n${body}\n${this.indStr()}}`);
    }
    fmtImport(s) {
        if (s.specifiers.length > 0) {
            const specs = s.specifiers.map((sp) => sp.alias ? `${sp.name} as ${sp.alias}` : sp.name).join(", ");
            return this.ind(`import { ${specs} } from "${s.source}"`);
        }
        if (s.defaultName) {
            return this.ind(`import ${s.defaultName} from "${s.source}"`);
        }
        return this.ind(`import ${s.source}`);
    }
    fmtTest(s) {
        return this.ind(`test "${s.description}" ${this.fmtBlock(s.body).trimStart()}`);
    }
    fmtAssert(s) {
        if (s.message) {
            return this.ind(`assert(${this.fmtExpr(s.condition)}, ${this.fmtExpr(s.message)})`);
        }
        return this.ind(`assert(${this.fmtExpr(s.condition)})`);
    }
    // ── Expressions ────────────────────────────────────────────────────────────
    fmtExpr(expr) {
        switch (expr.kind) {
            case "IntLiteral": return expr.raw;
            case "FloatLiteral": return expr.raw;
            case "StringLiteral": return `"${escapeString(expr.value)}"`;
            case "BoolLiteral": return String(expr.value);
            case "NullLiteral": return "null";
            case "IdentExpr": return expr.name;
            case "BinaryExpr": return `${this.fmtExprPrec(expr.left, expr)} ${expr.op} ${this.fmtExprPrec(expr.right, expr)}`;
            case "UnaryExpr": return `${expr.op}${this.fmtExpr(expr.operand)}`;
            case "CallExpr": return `${this.fmtExpr(expr.callee)}(${expr.args.map((a) => this.fmtExpr(a)).join(", ")})`;
            case "IndexExpr": return `${this.fmtExpr(expr.object)}[${this.fmtExpr(expr.index)}]`;
            case "MemberExpr": return `${this.fmtExpr(expr.object)}${expr.optional ? "?." : "."}${expr.property}`;
            case "AssignExpr": return `${this.fmtExpr(expr.target)} = ${this.fmtExpr(expr.value)}`;
            case "CompoundAssignExpr": return `${this.fmtExpr(expr.target)} ${expr.op} ${this.fmtExpr(expr.value)}`;
            case "ArrayExpr": {
                if (expr.elements.length === 0)
                    return "[]";
                return `[${expr.elements.map((e) => this.fmtExpr(e)).join(", ")}]`;
            }
            case "ObjectExpr": {
                if (expr.fields.length === 0)
                    return "{}";
                const fields = expr.fields.map((f) => `${f.key}: ${this.fmtExpr(f.value)}`).join(", ");
                return `{ ${fields} }`;
            }
            case "FunctionExpr": {
                const prefix = expr.isAsync ? "async " : "";
                const params = expr.params.map((p) => this.fmtParam(p)).join(", ");
                let sig = `${prefix}fn(${params})`;
                if (expr.returnType)
                    sig += ` -> ${this.fmtType(expr.returnType)}`;
                return `${sig} ${this.fmtBlock(expr.body).trimStart()}`;
            }
            case "IfExpr": {
                let s = `if ${this.fmtExpr(expr.condition)} ${this.fmtBlock(expr.then).trimStart()}`;
                if (expr.else_) {
                    if (expr.else_.kind === "BlockStmt") {
                        s += ` else ${this.fmtBlock(expr.else_).trimStart()}`;
                    }
                    else {
                        s += ` else ${this.fmtExpr(expr.else_)}`;
                    }
                }
                return s;
            }
            case "BlockExpr": {
                this.indent++;
                const body = expr.body.map((s) => this.formatStmt(s)).join("\n");
                this.indent--;
                return `{\n${body}\n${this.indStr()}}`;
            }
            case "StructInitExpr": {
                const fields = expr.fields.map((f) => `${f.key}: ${this.fmtExpr(f.value)}`).join(", ");
                return `${expr.name} { ${fields} }`;
            }
            case "RangeExpr": {
                const op = expr.inclusive ? "..=" : "..";
                return `${this.fmtExpr(expr.start)}${op}${this.fmtExpr(expr.end)}`;
            }
            case "CastExpr":
                return `${this.fmtExpr(expr.expr)} as ${this.fmtType(expr.targetType)}`;
            case "MatchExpr": {
                const arms = expr.arms.map((a) => {
                    const pat = this.fmtPattern(a.pattern);
                    const guard = a.guard ? ` if ${this.fmtExpr(a.guard)}` : "";
                    const b = a.body.kind === "BlockStmt" ? this.fmtBlock(a.body).trimStart() : this.fmtExpr(a.body);
                    return `${" ".repeat((this.indent + 1) * this.INDENT_SIZE)}${pat}${guard} => ${b},`;
                });
                return `match ${this.fmtExpr(expr.scrutinee)} {\n${arms.join("\n")}\n${this.indStr()}}`;
            }
            case "AwaitExpr":
                return `await ${this.fmtExpr(expr.expr)}`;
        }
    }
    fmtPattern(p) {
        switch (p.kind) {
            case "LiteralPattern": return this.fmtExpr(p.literal);
            case "WildcardPattern": return "_";
            case "IdentPattern": return p.name;
            case "ArrayPattern": return `[${p.elements.map(e => this.fmtPattern(e)).join(", ")}]`;
        }
    }
    /** Wrap sub-expression in parens if its precedence is lower than parent. */
    fmtExprPrec(expr, parent) {
        if (expr.kind === "BinaryExpr") {
            if (binaryPrec(expr.op) < binaryPrec(parent.op)) {
                return `(${this.fmtExpr(expr)})`;
            }
        }
        return this.fmtExpr(expr);
    }
    // ── Type expressions ───────────────────────────────────────────────────────
    fmtType(t) {
        switch (t.kind) {
            case "NamedType": return t.name;
            case "ArrayType": return `[${this.fmtType(t.elementType)}]`;
            case "NullableType": return `${this.fmtType(t.inner)}?`;
            case "FunctionType": {
                const params = t.params.map((p) => this.fmtType(p)).join(", ");
                const ret = t.returnType ? ` -> ${this.fmtType(t.returnType)}` : "";
                return `fn(${params})${ret}`;
            }
        }
    }
    // ── Indentation helpers ────────────────────────────────────────────────────
    ind(s) {
        return `${this.indStr()}${s}`;
    }
    indStr() {
        return " ".repeat(this.indent * this.INDENT_SIZE);
    }
}
exports.Formatter = Formatter;
// ─── Helpers ──────────────────────────────────────────────────────────────────
function binaryPrec(op) {
    switch (op) {
        case "||": return 1;
        case "&&": return 2;
        case "|": return 3;
        case "^": return 4;
        case "&": return 5;
        case "==":
        case "!=": return 6;
        case "<":
        case "<=":
        case ">":
        case ">=": return 7;
        case "<<":
        case ">>": return 8;
        case "+":
        case "-": return 9;
        case "*":
        case "/":
        case "%": return 10;
        case "**": return 11;
        default: return 0;
    }
}
function escapeString(s) {
    return s
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t")
        .replace(/\r/g, "\\r");
}
// ─── Convenience function ─────────────────────────────────────────────────────
const lexer_js_1 = require("../lexer/lexer.js");
const parser_js_1 = require("../parser/parser.js");
const index_js_1 = require("../errors/index.js");
function formatSource(source, fileName = "<source>", edition) {
    const reporter = new index_js_1.ErrorReporter(source, fileName);
    const lexer = new lexer_js_1.Lexer(source, fileName, reporter);
    const tokens = lexer.tokenize();
    const ed = edition ?? (/edition\s*=\s*"2027"/.test(source) || /#feature\(traits\)/.test(source) || /#feature\(async\)/.test(source) || /\btrait\b/.test(source) || /\basync\b/.test(source) ? "2027" : "2026");
    const parser = new parser_js_1.Parser(tokens, source, fileName, reporter, ed);
    const ast = parser.parse();
    if (reporter.hasErrors()) {
        return source;
    }
    return new Formatter().format(ast);
}
function format(input) {
    if (typeof input === "string") {
        return formatSource(input);
    }
    return new Formatter().format(input);
}
//# sourceMappingURL=index.js.map