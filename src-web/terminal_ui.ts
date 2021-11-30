import {Terminal} from "xterm";
import LocalEchoController from "./local-echo";

export class TerminalUI {
  terminal: Terminal;
  cursorShown: boolean;
  localEcho: LocalEchoController;
  currentLine: string | null;

  constructor(container: HTMLElement) {
    this.terminal = new Terminal({
      theme: {background: "#222", cursor: "#222"},
      fontFamily: "'Consolas', monospace",
      cursorBlink: false
    });

    this.cursorShown = false;
    this.currentLine = null;

    this.localEcho = new LocalEchoController();
    this.terminal.loadAddon(this.localEcho);

    this.terminal.open(container);
  }

  showCursor(show: boolean) {
    this.cursorShown = show;
    const cursorColor = show ? "#fff" : "#222";
    this.terminal.options.theme = {background: "#222", cursor: cursorColor};
    this.terminal.options.cursorBlink = show;
  }

  clear() {
    this.terminal.clear();
  }

  focus() {
    this.terminal.focus();
  }

  private prependCurrentLine(str: string) {
    return this.currentLine != null ? this.currentLine + str : str;
  }

  write(data: string) {
    let lastLineBreak = data.lastIndexOf("\n");

    if (lastLineBreak < 0) {
      this.currentLine = this.prependCurrentLine(data);
    } else if (lastLineBreak === data.length - 1) {
      this.localEcho.print(this.prependCurrentLine(data));
      this.currentLine = null;
    } else {
      const head = data.slice(0, lastLineBreak + 1);
      const tail = data.slice(lastLineBreak + 1);
      this.localEcho.print(this.prependCurrentLine(head));
      this.currentLine = tail;
    }
  }

  writeln(data: string) {
    this.write(data + "\n");
  }

  async readToBuffer(iobuffer: Int32Array) {
    this.showCursor(true);
    let prompt = "";
    if (this.currentLine) {
      prompt = this.currentLine;
      this.currentLine = null;
    }

    let input = await this.localEcho.read(prompt);
    this.showCursor(false);

    if (input == null) {
      iobuffer[1] = -1;
    } else {
      input += "\n";
      const length = input.length;
      iobuffer[1] = length;

      for (let i = 0; i < length; i++) {
        iobuffer[i + 2] = input.charCodeAt(i);
      }
    }

    Atomics.store(iobuffer, 0, 1);
    Atomics.notify(iobuffer, 0, 1);
  }
}
