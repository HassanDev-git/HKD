const fs = require("fs");
const { ErrorReporter } = require("../../dist/errors/index.js");
const { Lexer } = require("../../dist/lexer/lexer.js");
const { Parser } = require("../../dist/parser/parser.js");
const { SemanticAnalyser } = require("../../dist/semantic/analyser.js");
const { Compiler } = require("../../dist/bytecode/compiler.js");
const { lowerToRegisterChunk } = require("../../dist/bytecode/register_lowering.js");

const files = [
  "benchmarks/phase9/workloads/minimal.hkd",
  "benchmarks/phase9/workloads/loop_tight.hkd",
  "benchmarks/phase9/workloads/recursion_fib.hkd",
  "benchmarks/phase9/workloads/data_strings.hkd",
  "benchmarks/phase9/workloads/control_flow_branching.hkd",
  "benchmarks/phase9/workloads/control_flow_nested_loops.hkd",
  "benchmarks/phase9/workloads/arithmetic_integer.hkd"
];

console.log("| Workload File | Stack Bytecode Bytes | Register Instruction Count | Ratio (Reg Ins / Stack Bytes) |");
console.log("| :--- | ---: | ---: | ---: |");

files.forEach(f => {
  const src = fs.readFileSync(f, "utf-8");
  const rep = new ErrorReporter(src, f);
  const parser = new Parser(new Lexer(src, f, rep).tokenize(), src, f, rep);
  const ast = parser.parse();
  new SemanticAnalyser(rep, src).analyse(ast);
  const chunk = new Compiler(rep).compile(ast);
  const regChunk = lowerToRegisterChunk(chunk);
  console.log(`| \`${f.replace("benchmarks/phase9/workloads/", "")}\` | ${chunk.code.length} B | ${regChunk.code.length} ins | ${(regChunk.code.length / chunk.code.length).toFixed(2)} |`);
});
