import { parentPort, workerData } from "worker_threads";

const iobuffer = workerData.iobuffer;
const mod = workerData.wasmModule;
let linebuffer = "";

const sendMessage = (command, data) => {
  parentPort.postMessage({command, data});
}

const decoder = new TextDecoder();

const requestReadline = () => {
  Atomics.store(iobuffer, 0, 0);
  parentPort.postMessage({command: "read"});
  Atomics.wait(iobuffer, 0, 0);

  const length = Atomics.load(iobuffer, 0);
  if (length === 0) return;

  const result = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = iobuffer[i+1];
  }

  linebuffer += decoder.decode(result);
}

const skipWhitespace = (str) => {
  const match = str.match(/^\s+/);
  if (!match) return str;

  return str.slice(match[0].length);
}

const getNonSpace = (str) => {
  const match = str.match(/^[^\s]+/);
  if (!match) return ["", str];

  return [match[0], str.slice(match[0].length)];
}

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
    },

    $readint: () => {
      let str; let finished = false;
      do {
        linebuffer = skipWhitespace(linebuffer);
        [str, linebuffer] = getNonSpace(linebuffer);
        if (str) {
          let parsed = parseInt(str, 10);

          if (isNaN(parsed)) parsed = 0; // TODO: runtime err?
          return parsed;
        } else {
          requestReadline();
        }
      } while (!finished);
    },

    $readchar: () => {
      if (linebuffer.length < 1) {
        requestReadline();
      }

      let c = linebuffer.charCodeAt(0);
      linebuffer = linebuffer.slice(1);
      return c;
    },

    $readreal: () => {
      let str; let finished = false;
      do {
        linebuffer = skipWhitespace(linebuffer);
        [str, linebuffer] = getNonSpace(linebuffer);
        if (str) {
          let parsed = parseFloat(str);

          if (isNaN(parsed)) parsed = 0; // TODO: runtime err?
          return parsed;
        } else {
          requestReadline();
        }
      } while (!finished);
    },

    $readstr: (addr, maxsize) => {
      if (linebuffer.length < 1) {
        requestReadline();
      }
      const newline = linebuffer.indexOf("\n");
      let str = "";

      if (newline >= 0) {
        str = linebuffer.slice(0, newline);
        linebuffer = linebuffer.slice(newline);
      }

      if (str.length > maxsize) {
        str = str.slice(0, maxsize);
      }

      memory[addr] = str.length;
      for (let i = 0; i < str.length; i++) {
        memory[addr + 1 + i] = str.charCodeAt(i);
      }
    },

    $readln: () => {
      if (linebuffer.length < 1) {
        requestReadline();
      }

      const newline = linebuffer.indexOf("\n");
      if (newline >= 0) {
        linebuffer = linebuffer.slice(newline+1);
      }
    }
  }
};

const instance = new WebAssembly.Instance(mod, importObject);
memory = new Uint8Array(instance.exports.mem.buffer);
instance.exports.main();
