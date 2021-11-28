import {createImports, InterruptRuntime, RuntimeError} from "../src/import_object";

const sendCommand = (command, data) => {
  self.postMessage({command, data});
};

const runner = {
  iobuffer: null, sendCommand, memory: null
};

const importObject = createImports(runner);

function run(iobuffer, wasmModule) {
  runner.iobuffer = iobuffer;
  const instance = new WebAssembly.Instance(wasmModule, importObject);
  runner.memory = new Uint8Array(instance.exports.mem.buffer);
  try {
    instance.exports.main();
    sendCommand("write", "\nProgram finished.\n");
  } catch (e) {
    if (e instanceof InterruptRuntime) {
      sendCommand("write", "\nProgram interrupted.\n");
    } else if (e instanceof RuntimeError) {
      sendCommand("write", `\n${e.message}\n`);
    } else {
      console.error(e);
    }
  }
}

self.addEventListener('message', (event) => {
  if (runner.iobuffer) return;
  run(event.data.iobuffer, event.data.wasmModule);
});
