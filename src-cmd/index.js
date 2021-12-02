import { compile } from "../src/";
import fs from "fs";
import fsPromise from "fs/promises";
import readline from "readline";
import { Worker } from "worker_threads";
import { FileHandler } from "../src/file_handler";
import path from "path";

let debugWasm = false;
let optimize = true;
let compileOnly = false;

if (!process.argv[2]){
  console.error("Usage: yarn start [filename]");
  process.exit(1);
}

let filename = process.argv[2];

const option = process.argv[3];

switch(option) {
  case "--test": {
    debugWasm = false;
    optimize = false;
    compileOnly = false;
    break;
  }

  case "--debug": {
    debugWasm = true;
    optimize = false;
    compileOnly = false;
    break;
  }

  case "--compile": {
    debugWasm = false;
    optimize = true;
    compileOnly = true;
    break;
  }
}

runFile(filename);

function runFile(filename) {
  const data = fs.readFileSync(filename).toString();

  const compileTime = "Compiled in";
  console.time(compileTime)

  const binary = compile(data, console, optimize, debugWasm);
  if (!binary) return;

  console.timeEnd(compileTime);

  if (compileOnly){
    fs.writeFileSync("tmp/compiled.wasm", binary);
    return;
  }

  if (debugWasm) {
    fs.writeFile("tmp/debug.wasm", binary, (err) => {
      if (err) console.error(err.message);
    });
  }

  const iobuffer = new Int32Array(new SharedArrayBuffer(4096));
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

    iobuffer[1] = input.length;
    for (let i = 0; i < input.length; i++) {
      iobuffer[i + 2] = input.charCodeAt(i);
    }

    Atomics.store(iobuffer, 0, 1);
    Atomics.notify(iobuffer, 0, 1);
  }

  rl.on('line', (input) => {
    input += "\n";
    linebuffers.push(input);

    if (waitingForLine) {
      notifyRead();
    }
  });

  const runDir = process.cwd();

  const fileRead = async (filename) => {
    try {
      const data = await fsPromise.readFile(path.join(runDir, filename));
      return new Uint8Array(data);
    } catch(e) {
      return null;
    }
  }

  const fileWrite = async (filename, data) => {
    try {
      await fsPromise.writeFile(path.join(runDir, filename), data);
      return true;
    } catch (e) {
      console.error(e.message);
      return false;
    }
  }

  const filehandler = new FileHandler(iobuffer, fileRead, fileWrite);

  const notifyResult = (result) => {
    Atomics.store(iobuffer, 0, result);
    Atomics.notify(iobuffer, 0, 1);
  }

  process.chdir(__dirname);
  const worker = new Worker("./runner.js", {workerData: {iobuffer, wasmModule}});
  worker.on("message", (message) => {
    switch(message?.command) {
      case "write": {
        if (message.data.fileId == null) {
          process.stdout.write(message.data.value);
        } else {
          filehandler.writebyte(message.data.fileId, message.data.value)
            .then(notifyResult);
        }
        break;
      }
      case "read": {
        if (message.data?.fileId != null) {
          filehandler.readline(message.data.fileId).then(notifyResult);
        } else {
          if (inputPaused) {
            inputPaused = false;
            rl.resume();
          }

          notifyRead();
        }
        break;
      }

      case "eofFile" :{
        filehandler.eof(message.data.fileId).then(notifyResult);
        break;
      }

      case "readbyte": {
        filehandler.readbyte(message.data.fileId, message.data.size).then(notifyResult);
        break;
      }

      case "assignFile": {
        filehandler.assign(message.data.fileId, message.data.filename);
        break;
      }

      case "resetFile": {
        filehandler.reset(message.data.fileId).then(notifyResult);
        break;
      }

      case "rewriteFile": {
        filehandler.rewrite(message.data.fileId).then(notifyResult);
        break;
      }

      case "closeFile": {
        filehandler.close(message.data.fileId).then(notifyResult);
        break;
      }

      case "delay": {
        setTimeout(() => notifyResult(1), message.data.value);
        break;
      }
    }
  });

  worker.on("error", (err) => {
    if (err.message.startsWith("Runtime error:")) {
      console.error(err.message);
    } else {
      console.error(err);
    }
  });

  worker.on("exit", exitcode => {
    rl.close();
    if (exitcode !== 0) process.exit(exitcode);
  });
}
