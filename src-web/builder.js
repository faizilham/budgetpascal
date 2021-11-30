import {compile} from "../src/";
import { FileHandler } from "../src/file_handler";

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

    if (binary) {
      cache.code = code;
      cache.binary = binary;
    }
  }


  return binary;
}

export function runCode(binary, terminal, files) {
  terminal.writeln("Running...");

  const iobuffer = new Int32Array(new SharedArrayBuffer(1064));
  const wasmModule = new WebAssembly.Module(binary);

  const worker = new Worker(new URL('runner.js', import.meta.url), {type: "module"});

  const fileRead = async (filename) => files.read(filename);
  const fileWrite = async (filename, data) => files.write(filename, data);
  const filehandler = new FileHandler(iobuffer, fileRead, fileWrite);

  const notifyResult = (result) => {
    Atomics.store(iobuffer, 0, result);
    Atomics.notify(iobuffer, 0, 1);
  };

  worker.addEventListener('message', (event) => {
    const message = event.data;

    switch(message?.command) {
      case "write": {
        if (message.data.fileId == null) {
          terminal.write(message.data.value);
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
          terminal.readToBuffer(iobuffer);
        }
        break;
      }

      /* files */

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

      /* crt */
      case "clrscr": {
        terminal.clear();
        break;
      }

      case "gotoxy": {
        terminal.gotoXY(message.data.x, message.data.y);
        break;
      }

      case "wherex": {
        iobuffer[1] = terminal.cursorPos().x;
        notifyResult(1);
        break;
      }

      case "wherey": {
        iobuffer[1] = terminal.cursorPos().y;
        notifyResult(1);
        break;
      }

      case "readkey": {

        break;
      }
    }
  });

  worker.postMessage({iobuffer, wasmModule});
  terminal.focus();
}
