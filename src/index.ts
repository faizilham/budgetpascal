// import { compile } from "./compiler";

// const mod = compile();
// const instance : any = new WebAssembly.Instance(mod);

// console.log(instance.exports.add(1, 2));

import { Parser } from "./compiler/parser";
import fs from "fs";
import { ASTPrinter } from "./compiler/astprinter";

const data = fs.readFileSync("testcases/basic.pas").toString();

const parser = new Parser(data);
const program = parser.parse();

if (program) {
  const astprinter = new ASTPrinter(program);
  console.log(astprinter.print());
}
