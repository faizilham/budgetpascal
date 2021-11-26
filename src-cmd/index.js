import { compile } from "../src/";
import fs from "fs";
import readline from "readline";
import { Worker } from "worker_threads";

let debugWasm = false;
let optimize = true;

if (!process.argv[2]){
  console.error("Usage: yarn start [filename]");
  process.exit(1);
}

let filename = process.argv[2];
runFile(filename);

if (process.argv[3] === "--test") {
  debugWasm = false;
  optimize = false;
} else if (process.argv[3] === "--debug") {
  debugWasm = true;
  optimize = false;
}

function runFile(filename) {
  const data = fs.readFileSync(filename).toString();

  const compileTime = "Compiled in";
  console.time(compileTime)

  const binary = compile(data, console, optimize);
  if (!binary) return;

  console.timeEnd(compileTime);

  if (debugWasm) {
    fs.writeFile("tmp/debug.wasm", binary, (err) => {
      if (err) console.error(err.message);
    });
  }

  const iobuffer = new Int32Array(new SharedArrayBuffer(1064));
  const wasmModule = new WebAssembly.Module(binary);

  const linebuffers = [];
  let waitingForLine = false;
  let inputPaused = true;

  const rl = readline.createInterface({input: process.stdin, crlfDelay: Infinity});
  rl.pause();

  const notifyRead = () => {
    if (linebuffers.length < 1) {
      waitingForLine = true;
      return;
    }

    waitingForLine = false;
    let input = linebuffers.shift();

    Atomics.store(iobuffer, 0, input.length);
    for (let i = 0; i < input.length; i++) {
      iobuffer[i + 1] = input.charCodeAt(i);
    }
    Atomics.notify(iobuffer, 0, 1);
  }

  rl.on('line', (input) => {
    input += "\n";
    linebuffers.push(input);

    if (waitingForLine) {
      notifyRead();
    }
  });

  process.chdir(__dirname);
  const worker = new Worker("./runner.js", {workerData: {iobuffer, wasmModule}});
  worker.on("message", (message) => {
    switch(message?.command) {
      case "write": process.stdout.write(message.data); break;
      case "read": {
        if (inputPaused) {
          inputPaused = false;
          rl.resume();
        }

        notifyRead();
        break;
      }
    }
  });

  worker.on("error", err => console.error(err));
  worker.on("exit", exitcode => {
    rl.close();
  });
}
