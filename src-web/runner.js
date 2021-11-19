import {createImports} from "../src/import_object";

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
  instance.exports.main();
  sendCommand("write", "\nProgram finished.\n");
}

self.addEventListener('message', (event) => {
  if (runner.iobuffer) return;
  run(event.data.iobuffer, event.data.wasmModule);
});
