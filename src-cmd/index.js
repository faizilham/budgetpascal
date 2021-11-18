import { compile } from "../src/";
import fs from "fs";
import readline from "readline";
import { Worker } from "worker_threads";

const debugWasm = true;

let filename = "testcases/strings.pas";
// let filename = "testcases/errors/syntax_err.pas";

if (process.argv[2]) filename = process.argv[2];

runFile(filename);

function runFile(filename) {
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

  const iobuffer = new Uint8Array(new SharedArrayBuffer(1064));
  const wasmModule = new WebAssembly.Module(binary);

  const rl = readline.createInterface({input: process.stdin, output: process.stdout});
  rl.pause();

  process.chdir(__dirname);
  const worker = new Worker("./runner.js", {workerData: {iobuffer, wasmModule}});
  worker.on("message", (message) => {
    switch(message?.command) {
      case "write": process.stdout.write(message.data); break;
    }
  });

  worker.on("error", err => console.error(err));
  worker.on("exit", exitcode => {
    rl.close();
  });
}
