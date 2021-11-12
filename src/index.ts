import { compile } from "./compiler";
import { Parser } from "./compiler/parser";
import fs from "fs";
import { ASTPrinter } from "./compiler/astprinter";
import { ErrLogger } from "./compiler/errors";

const debugWasm = true;

// const filename = "testcases/basic_expression.pas";
const filename = "testcases/errors/declaration_err.pas";
const data = fs.readFileSync(filename).toString();

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
      if (err) ErrLogger.logger.error(err.message);
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
