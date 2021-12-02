import {createImports, InterruptRuntime, RuntimeError} from "../src/import_object";

const sendCommand = (command, data) => {
  self.postMessage({command, data});
};

const workerFinished = (error, exitMessage) => {
  sendCommand("finish", {error, exitMessage});
}

const runner = {
  iobuffer: null, sendCommand, memory: null, instance: null
};

const importObject = createImports(runner);

function run(iobuffer, binary) {
  runner.iobuffer = iobuffer;
  const wasmModule = new WebAssembly.Module(binary);
  const instance = new WebAssembly.Instance(wasmModule, importObject);
  runner.instance = instance;
  runner.memory = new Uint8Array(instance.exports.mem.buffer);
  try {
    instance.exports.main();
    workerFinished(false, "\nProgram finished.\n");
  } catch (e) {
    if (e instanceof InterruptRuntime) {
      workerFinished(false, "\nProgram interrupted.\n");
    } else if (e instanceof RuntimeError) {
      workerFinished(true, `\n${e.message}\n`);
    } else {
      console.error(e);
      workerFinished(true, `\nRuntime error.\n`);
    }
  }
}

self.addEventListener('message', (event) => {
  if (runner.iobuffer) return;
  run(event.data.iobuffer, event.data.binary);
});
