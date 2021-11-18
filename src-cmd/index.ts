import { compile } from "../src/";
import fs from "fs";

const debugWasm = true;

let filename = "testcases/strings.pas";
// let filename = "testcases/errors/syntax_err.pas";

if (process.argv[2]) filename = process.argv[2];

runFile(filename);

function runFile(filename: string) {
  const data = fs.readFileSync(filename).toString();

  const compileTime = "Compiled in";
  console.time(compileTime)

  const binary = compile(data);
  if (!binary) return;

  console.timeEnd(compileTime);

  if (debugWasm) {
    fs.writeFile("tmp/debug.wasm", binary, (err) => {
      if (err) console.error(err.message);
    });
  }

  let memory: any;
  const importObject = {
    rtl: {
      $putint: (n: number, mode: number) => {
        switch(mode) {
          case 1: process.stdout.write(String.fromCharCode(n)); break;
          case 2: process.stdout.write( n === 0 ? "FALSE" : "TRUE"); break;
          default:
            process.stdout.write(n.toString());
        }
      },
      $putreal: (x: number) => { process.stdout.write(x.toExponential()); },
      $putln: () => { process.stdout.write("\n"); },
      $putstr: (addr: number) => {
        let mem = memory as Uint8Array;
        const start = addr + 1;
        const end = start + mem[addr];

        // console.log(` putstr(${start},${end}) `);

        process.stdout.write(mem.slice(start, end));
      }
    }
  };

  const mod = new WebAssembly.Module(binary);
  const instance = new WebAssembly.Instance(mod, importObject);
  memory = new Uint8Array((instance.exports.mem as WebAssembly.Memory).buffer);

  const main: any = instance.exports.main;
  const runningTime = "Program finished in";
  console.time(runningTime)

  main();

  console.timeEnd(runningTime);
}
