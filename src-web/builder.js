import {compile} from "../src/";

const cache = {
  code: null,
  binary: null
}

export function compileCode(code, terminal, cached = true) {
  const logger = {
    error(...messages) {
      const data = messages.join(" ");
      terminal.writeln(data);
    }
  }

  let binary;
  if (cached && code === cache.code) {
    binary = cache.binary;
  } else {
    terminal.writeln("Compiling...");
    binary = compile(code, logger);
  }

  if (binary) {
    cache.code = code;
    cache.binary = binary;
  }

  return binary;
}

export function runCode(binary, terminal) {
  terminal.writeln("Running...");

  const iobuffer = new Uint8Array(new SharedArrayBuffer(1064));
  const wasmModule = new WebAssembly.Module(binary);

  const worker = new Worker(new URL('runner.js', import.meta.url));
  worker.addEventListener('message', (event) => {
    const msg = event.data;

    switch(msg?.command) {
      case "write": terminal.write(msg.data); break;
    }
  })

  worker.postMessage({iobuffer, wasmModule});
}
