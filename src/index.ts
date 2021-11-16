import { compile } from "./compiler";
import fs from "fs";
import { ErrLogger } from "./compiler/errors";

const debugWasm = true;

const filename = "testcases/strings.pas";
// const filename = "testcases/errors/syntax_err.pas";
const data = fs.readFileSync(filename).toString();

// function testParser() {
//   const parser = new Parser(data);
//   const program = parser.parse();

//   if (program) {
//     const astprinter = new ASTPrinter(program);
//     console.log(astprinter.print());
//   }
// }

const binary = compile(data);

if (binary) {
  if (debugWasm) {
    fs.writeFile("tmp/debug.wasm", binary, (err) => {
      if (err) ErrLogger.logger.error(err.message);
    });
  }

  const mod = new WebAssembly.Module(binary);
  let memory: any;

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
      putln: () => { process.stdout.write("\n"); },
      putstr: (addr: number) => {
        let mem = memory as Uint8Array;
        const start = addr + 1;
        const end = start + mem[addr];

        // console.log(` putstr(${start},${end}) `);

        process.stdout.write(mem.slice(start, end));
      }
    }
  };

  const instance = new WebAssembly.Instance(mod, importObject);
  memory = new Uint8Array((instance.exports.mem as WebAssembly.Memory).buffer);

  const main: any = instance.exports.main;
  main();
}
