import { compile } from "./compiler";
import { Parser } from "./compiler/parser";
import fs from "fs";
import { ASTPrinter } from "./compiler/astprinter";

const debugWasm = true;

const data = fs.readFileSync("testcases/basic.pas").toString();

function testParser() {
  const parser = new Parser(data);
  const program = parser.parse();

  if (program) {
    const astprinter = new ASTPrinter(program);
    console.log(astprinter.print());
  }
}

const binary = compile(data);

if (binary) {
  if (debugWasm) {
    fs.writeFile("tmp/debug.wasm", binary, (err) => {
      if (err) console.error(err.message);
    });
  }

  const mod = new WebAssembly.Module(binary);

  const importObject = {
    rtl: {
      putint: (n: number, mode: number) => {
        switch(mode) {
          case 1: process.stdout.write(String.fromCharCode(n)); break;
          case 2: process.stdout.write( n === 0 ? "FALSE" : "TRUE"); break;
          default:
            process.stdout.write(n.toString());
        }
      },
      putreal: (x: number) => { process.stdout.write(x.toExponential()); },
      putln: () => { process.stdout.write("\n"); }
    }
  };

  new WebAssembly.Instance(mod, importObject);
}
