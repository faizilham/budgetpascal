// import { compile } from "./compiler";

// const mod = compile();
// const instance : any = new WebAssembly.Instance(mod);

// console.log(instance.exports.add(1, 2));

import { Parser } from "./compiler/parser";
import fs from "fs";
import { ASTPrinter } from "./compiler/astprinter";

const data = fs.readFileSync("testcases/parser_expression.in").toString();

const parser = new Parser(data);
const expr = parser.parse();
const astprinter = new ASTPrinter(expr);

console.log(astprinter.print());
