import {createImports, InterruptRuntime, RuntimeError} from "../src/import_object";

const sendCommand = (command, data) => {
  self.postMessage({command, data});
};

const printToTerminal = (value) => {
  sendCommand("write", {value});
}

const runner = {
  iobuffer: null, sendCommand, memory: null, instance: null
};

const importObject = createImports(runner);

function run(iobuffer, wasmModule) {
  runner.iobuffer = iobuffer;
  const instance = new WebAssembly.Instance(wasmModule, importObject);
  runner.instance = instance;
  runner.memory = new Uint8Array(instance.exports.mem.buffer);
  try {
    instance.exports.main();
    printToTerminal("\nProgram finished.\n");
  } catch (e) {
    if (e instanceof InterruptRuntime) {
      printToTerminal("\nProgram interrupted.\n");
    } else if (e instanceof RuntimeError) {
      printToTerminal(`\n${e.message}\n`);
    } else {
      console.error(e);
    }
  }
}

self.addEventListener('message', (event) => {
  if (runner.iobuffer) return;
  run(event.data.iobuffer, event.data.wasmModule);
});
