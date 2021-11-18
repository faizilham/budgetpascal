import { parentPort, workerData } from "worker_threads";

const iobuffer = workerData.iobuffer;
const mod = workerData.wasmModule;

const sendMessage = (command, data) => {
  parentPort.postMessage({command, data});
}

// const imports = {
//   "lib": {
//     "write": (n) => { parentPort.postMessage({cmd: "writeln", val: n}) },
//     "read": () => {
//       Atomics.store(buffer, 0, 0);
//       parentPort.postMessage({cmd: "readln"});
//       Atomics.wait(buffer, 0, 0);
//       return Atomics.load(buffer, 0);
//     },
//   }
// }

let memory;
const importObject = {
  rtl: {
    $putint: (n, mode) => {
      switch(mode) {
        case 1: sendMessage("write", String.fromCharCode(n)); break;
        case 2: sendMessage("write", n === 0 ? "FALSE" : "TRUE"); break;
        default:
          sendMessage("write", n.toString());
      }
    },
    $putreal: (x) => { sendMessage("write", x.toExponential()); },
    $putln: () => { sendMessage("write", "\n"); },
    $putstr: (addr) => {
      const start = addr + 1;
      const end = start + memory[addr];

      sendMessage("write", memory.slice(start, end));
    }
  }
};

const instance = new WebAssembly.Instance(mod, importObject);
memory = new Uint8Array(instance.exports.mem.buffer);
instance.exports.main();
