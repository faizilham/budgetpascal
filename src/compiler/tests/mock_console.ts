import { ErrLogger } from "../errors";

export class MockLogger implements ErrLogger.Reporter {
  lines: string[] = []

  error(...messages: any[]): void {
    this.lines.push(messages.join(' '));
  }
}

export class MockConsole {
  lines: string[] = [];

  getImport() {
    let currentLines: string[] = [];
    const lines = this.lines;
    return {
      rtl: {
        putint: (n: number, mode: number) => {
          switch(mode) {
            case 1: currentLines.push(String.fromCharCode(n)); break;
            case 2: currentLines.push( n === 0 ? "FALSE" : "TRUE"); break;
            default:
              currentLines.push(n.toString());
          }
        },
        putreal: (x: number) => { currentLines.push(x.toExponential()); },
        putln: () => { lines.push(currentLines.join("").trim()); currentLines = []; }
      }
    }
  }
}
