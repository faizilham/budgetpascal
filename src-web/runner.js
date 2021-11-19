let iobuffer;
let memory;

const sendMessage = (command, data) => {
  self.postMessage({command, data});
};

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
    $putln: () => { sendMessage("write", "\r\n"); },
    $putstr: (addr) => {
      const start = addr + 1;
      const end = start + memory[addr];

      sendMessage("write", memory.slice(start, end));
    }
  }
};

function run(iobuffer, wasmModule) {
  iobuffer = new Uint8Array(iobuffer);
  const instance = new WebAssembly.Instance(wasmModule, importObject);
  memory = new Uint8Array(instance.exports.mem.buffer);
  instance.exports.main();
}

self.addEventListener('message', (event) => {
  if (iobuffer) return;
  run(event.data.iobuffer, event.data.wasmModule);
});
