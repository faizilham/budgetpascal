import { ErrLogger } from "../errors";

export class MockLogger implements ErrLogger.Reporter {
  lines: string[] = []

  error(...messages: any[]): void {
    this.lines.push(messages.join(' '));
  }
}

export class MockConsole {
  lines: string[] = [];
  memory?: Uint8Array

  setMemory(mem: WebAssembly.Memory) {
    this.memory = new Uint8Array(mem.buffer);
  }

  getImport() {
    let currentline: string[] = [];
    const lines = this.lines;
    return {
      rtl: {
        $putint: (n: number, mode: number) => {
          switch(mode) {
            case 1: currentline.push(String.fromCharCode(n)); break;
            case 2: currentline.push( n === 0 ? "FALSE" : "TRUE"); break;
            default:
              currentline.push(n.toString());
          }
        },
        $putreal: (x: number) => { currentline.push(x.toExponential()); },
        $putln: () => { lines.push(currentline.join("").trim()); currentline = []; },
        $putstr: (addr: number) => {
          const memory = this.memory as Uint8Array;

          const start = addr + 1;
          const end = start + memory[addr];

          const str = new TextDecoder().decode(memory.slice(start, end));
          currentline.push(str);
        }
      }
    }
  }
}
