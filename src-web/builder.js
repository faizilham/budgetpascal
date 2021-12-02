import { FileHandler } from "../src/file_handler";

const cache = {
  code: null,
  binary: null
}

export function setCache(code, binary) {
  cache.code = code;
  cache.binary = binary;
}

export function clearCache() {
  cache.code = null;
  cache.binary = null;
}

export function compileCode(code, terminal, cached = true) {
  if (cached && code === cache.code) {
    return Promise.resolve(cache.binary);
  }

  let resolver;
  let promise = new Promise((resolve) => {
    resolver = resolve;
  });

  terminal.writeln("Loading compiler...");

  const worker = new Worker(new URL('compile.js', import.meta.url), {type: "module"});
  worker.addEventListener('message', (event) => {
    const message = event.data;

    switch(message.command) {
      case "log": terminal.writeln(message.data); break;
      case "finish": {
        let binary = message.data;

        if (binary) {
          setCache(code, binary);
        }

        resolver(binary);
        break;
      }
    }
  });

  worker.postMessage(code);

  return promise;
}

export function runCode(binary, terminal, files) {
  terminal.writeln("Running...");

  const iobuffer = new Int32Array(new SharedArrayBuffer(4096));

  const worker = new Worker(new URL('runner.js', import.meta.url), {type: "module"});

  const fileRead = async (filename) => files.read(filename);
  const fileWrite = async (filename, data) => files.write(filename, data);
  const filehandler = new FileHandler(iobuffer, fileRead, fileWrite);

  const notifyResult = (result) => {
    Atomics.store(iobuffer, 0, result);
    Atomics.notify(iobuffer, 0, 1);
  };

  let resolver;
  const promise = new Promise((resolve) => {
    resolver = resolve;
  })

  worker.addEventListener('message', (event) => {
    const message = event.data;

    switch(message?.command) {
      case "finish": {
        const data = message.data;
          if (data.exitMessage) {
            terminal.write(data.exitMessage);
          }

          resolver();
        break;
      }

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

      case "delay": {
        setTimeout(() => notifyResult(1), message.data.value);
        break;
      }

      case "gotoxy": {
        terminal.gotoXY(message.data.x, message.data.y);
        break;
      }

      case "wherex": {
        terminal.cursorPos().then(pos => {
          iobuffer[1] = pos.x;
          notifyResult(1);
        });
        break;
      }

      case "wherey": {
        terminal.cursorPos().then(pos => {
          iobuffer[1] = pos.y;
          notifyResult(1);
        });
        break;
      }

      case "readkey": {
        terminal.readKey().then((value) => {
          iobuffer[1] = value;
          notifyResult(1);
        })
        break;
      }
    }
  });

  worker.postMessage({iobuffer, binary});
  terminal.focus();

  return promise;
}
