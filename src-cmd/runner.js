import { parentPort, workerData } from "worker_threads";
import { createImports } from "../src/import_object";

const iobuffer = workerData.iobuffer;
const mod = workerData.wasmModule;

const sendCommand = (command, data = undefined) => {
  parentPort.postMessage({command, data});
}

const runner = {
  iobuffer, sendCommand, memory: null
};

const importObject = createImports(runner);

const instance = new WebAssembly.Instance(mod, importObject);
runner.memory = new Uint8Array(instance.exports.mem.buffer);
instance.exports.main();
