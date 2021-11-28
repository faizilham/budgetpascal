type SendCommand = (command: string, data?: any) => void;
interface Runner {
  iobuffer: Int32Array,
  memory: Uint8Array,
  sendCommand: SendCommand
}

export class InterruptRuntime extends Error {}

export function createImports(runner: Runner): Object {
  let linebuffer = "";
  const decoder = new TextDecoder();

  const requestReadline = () => {
    Atomics.store(runner.iobuffer, 0, 0);
    runner.sendCommand("read");
    Atomics.wait(runner.iobuffer, 0, 0);

    const length = Atomics.load(runner.iobuffer, 0);
    if (length === 0) return;
    else if (length < 0) throw new InterruptRuntime();

    const result = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      result[i] = runner.iobuffer[i+1];
    }

    linebuffer += decoder.decode(result);
  }

  const getString = (addr: number): string => {
    const start = addr + 1;
    const end = start + runner.memory[addr];
    return decoder.decode(runner.memory.slice(start, end));
  }

  const padded = (str: string, spacing: number): string => {
    let padSize = spacing - str.length;
    if (padSize < 1) return str;

    return ' '.repeat(padSize) + str;
  }

  const importObject = {
    io: {
      $putint: (n: number, mode: number, spacing: number) => {
        let str;
        switch(mode) {
          case 1: str = String.fromCharCode(n); break;
          case 2: str = n === 0 ? "FALSE" : "TRUE"; break;
          default:
            str = n.toString();
        }

        runner.sendCommand("write", padded(str, spacing));
      },
      $putreal: (x: number, spacing: number, decimal: number) => {
        let str = decimal < 0 ?
          x.toExponential() :
          x.toFixed(decimal);

        runner.sendCommand("write", padded(str, spacing));
      },
      $putln: () => { runner.sendCommand("write", "\n"); },
      $putstr: (addr: number, spacing: number) => {
        runner.sendCommand("write", padded(getString(addr), spacing));
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

      $readstr: (addr: number, maxsize: number) => {
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

        runner.memory[addr] = str.length;
        for (let i = 0; i < str.length; i++) {
          runner.memory[addr + 1 + i] = str.charCodeAt(i);
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
    },

    rtl: {
      $pos: (substrAddr: number, sourceAddr: number): number => {
        const substr = getString(substrAddr);
        const source = getString(sourceAddr);
        return source.indexOf(substr) + 1;
      }
    }
  };

  return importObject;
}

function skipWhitespace(str: string): string{
  const match = str.match(/^\s+/);
  if (!match) return str;

  return str.slice(match[0].length);
}

function getNonSpace(str: string): [string, string] {
  const match = str.match(/^[^\s]+/);
  if (!match) return ["", str];

  return [match[0], str.slice(match[0].length)];
}
