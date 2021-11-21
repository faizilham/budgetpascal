import { compile } from "../src/";
import fs from "fs";
import readline from "readline";
import { Worker } from "worker_threads";

const debugWasm = true;

if (!process.argv[2]){
  console.error("Usage: yarn start [filename]");
  process.exit(1);
}

let filename = process.argv[2];
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

  const iobuffer = new Int32Array(new SharedArrayBuffer(1064));
  const wasmModule = new WebAssembly.Module(binary);

  const rl = readline.createInterface({input: process.stdin, output: process.stdout});
  rl.pause();

  rl.on('line', (input) => {
    rl.pause();
    input += "\n";
    const length = input.length;

    Atomics.store(iobuffer, 0, length);
    for (let i = 0; i < length; i++) {
      iobuffer[i + 1] = input.charCodeAt(i);
    }
    Atomics.notify(iobuffer, 0, 1);
  });


  process.chdir(__dirname);
  const worker = new Worker("./runner.js", {workerData: {iobuffer, wasmModule}});
  worker.on("message", (message) => {
    switch(message?.command) {
      case "write": process.stdout.write(message.data); break;
      case "read": rl.resume(); break;
    }
  });

  worker.on("error", err => console.error(err));
  worker.on("exit", exitcode => {
    rl.close();
  });
}
