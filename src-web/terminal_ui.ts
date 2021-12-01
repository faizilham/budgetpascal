import {Terminal} from "xterm";
import ansi from 'ansi-escapes';
import {SpecialKeys, PascalSpecialKeys} from "../src/keyboard_map";

const ESCAPE_KEY = 0x1b;

type ResolveFunc = ((result: string|null) => void);

export class TerminalUI {
  terminal: Terminal;
  cursorShown: boolean;
  private readlineActive: boolean;
  private readResolver: ResolveFunc | null;
  private readline: string;
  private readcursor: number;
  private readkeyActive: boolean;

  constructor(container: HTMLElement) {
    this.terminal = new Terminal({
      theme: {background: "#222", cursor: "#222"},
      fontFamily: "'Consolas', monospace",
      cursorBlink: false
    });

    this.cursorShown = false;
    this.readlineActive = false;
    this.readkeyActive = false;

    this.readResolver = null;
    this.readline = "";
    this.readcursor = 0;

    this.terminal.onData((data) => this.handleData(data));

    this.terminal.open(container);
  }

  private startReadkey() {
    this.readkeyActive = true;
    return new Promise<string|null>((resolve) => {
      this.readResolver = resolve;
    })
  }

  private handleKey(key: string) {
    this.readkeyActive = false;
    (this.readResolver as ResolveFunc)(key);
  }

  private startRead() {
    if (this.readlineActive) return;
    this.readlineActive = true;
    this.readline = "";
    this.readcursor = 0;

    return new Promise<string|null>((resolve) => {
      this.readResolver = resolve;
    });
  }

  private finishRead(interrupted: boolean) {
    if (!this.readlineActive) return;

    let result = null;
    if (!interrupted) {
      result = this.readline + "\r\n";
    }

    this.readlineActive = false;

    (this.readResolver as ResolveFunc)(result);
    this.readResolver = null;
  }

  private insertData(data: string) {
    const newReadline = this.readline.substring(0, this.readcursor) + data + this.readline.substring(this.readcursor);
    this.refreshReadline(newReadline, data.length)
  }

  private refreshReadline(newReadline: string, moveCursor: number) {
    if (this.readcursor > 0) {
      this.terminal.write(ansi.cursorBackward(this.readcursor));
    }
    this.terminal.write(ansi.eraseEndLine);

    this.terminal.write(newReadline);
    this.readline = newReadline;
    this.readcursor += moveCursor;

    if (this.readcursor < 0) {
      this.readcursor = 0;
    } else if (this.readcursor > this.readline.length) {
      this.readcursor = this.readline.length;
    }

    const offset = this.readline.length - this.readcursor;
    if (offset > 0) {
      this.terminal.write(ansi.cursorBackward(offset));
    }
  }

  private moveReadCursor(offset: number) {
    if (offset < 0) {
      let newPos = this.readcursor + offset;
      if (newPos < 0) newPos = 0;

      const change = this.readcursor - newPos;
      if (change > 0){
        this.terminal.write(ansi.cursorBackward(change));
      }
      this.readcursor = newPos;
    } else if (offset > 0) {
      let newPos = this.readcursor + offset;
      if (newPos > this.readline.length) newPos = this.readline.length;
      const change = newPos - this.readcursor;

      if (change > 0) {
        this.terminal.write(ansi.cursorForward(change));
      }
      this.readcursor = newPos;
    }
  }

  private handleErase(isBackspace: boolean) {
    let newReadline;
    let moveCursor;

    if (isBackspace) {
      if (this.readcursor === 0) return;
      newReadline = this.readline.substring(0, this.readcursor - 1) + this.readline.substring(this.readcursor);
      moveCursor = -1;
    } else {
      if (this.readcursor === this.readline.length) return;
      newReadline = this.readline.substring(0, this.readcursor) + this.readline.substring(this.readcursor + 1);
      moveCursor = 0;
    }

    this.refreshReadline(newReadline, moveCursor);
  }

  private handleData(data: string) {
    if (this.readkeyActive) return this.handleKey(data);
    if (!this.readlineActive) return;

    const ord = data.charCodeAt(0);

    if (ord === ESCAPE_KEY) { // handle ansi sequence
      switch(data.substring(1)) {
        case "[D": // Left Arrow
          this.moveReadCursor(-1);
        break;

        case "[C": // Right Arrow
          this.moveReadCursor(1);
        break;
        case "[3~": // Delete
          this.handleErase(false);
        break;

        case "[F": // End
          this.moveReadCursor(this.readline.length);
        break;

        case "[H": // Home
          this.moveReadCursor(-this.readcursor);
        break;
      }
    } else if (ord < 32 || ord === 0x7f) {
      switch (data) {
        case "\r": // ENTER
          this.finishRead(false);
        break;

        case "\x7F": // BACKSPACE
          this.handleErase(true);
        break;

        case "\t": // TAB
          this.insertData("    ");
        break;

        case "\x03": // CTRL+C
          this.moveReadCursor(this.readline.length);
          this.terminal.write("^C\r\n");
          this.finishRead(true);
        break;
        }
    } else {
      this.insertData(data);
    }
  }

  showCursor(show: boolean) {
    this.cursorShown = show;
    const cursorColor = show ? "#fff" : "#222";
    this.terminal.options.theme = {background: "#222", cursor: cursorColor};
    this.terminal.options.cursorBlink = show;
  }

  clear() {
    this.terminal.write(ansi.clearTerminal);
  }

  gotoXY(x: number, y: number) {
    this.terminal.write(ansi.cursorTo(x - 1, y - 1));
  }

  cursorPos() {
    const x = this.terminal.buffer.active.cursorX + 1;
    const y = this.terminal.buffer.active.cursorY + 1;
    return {x, y};
  }

  focus() {
    this.terminal.focus();
  }

  write(data: string) {
    this.terminal.write(data.replace(/\r?\n/g, "\r\n"));
  }

  writeln(data: string) {
    this.write(data + "\n");
  }

  async readKey() {
    const result = await this.startReadkey();
    if (!result) return 0;
    let code = result.charCodeAt(0);

    if (code === ESCAPE_KEY) {
      const mapping = SpecialKeyMapping[result.substring(1)];
      if (mapping != null) {
        code = PascalSpecialKeys[mapping];
      } else {
        code = 0;
      }
    }

    return code;
  }

  async readToBuffer(iobuffer: Int32Array) {
    this.showCursor(true);
    let input = await this.startRead();
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

const SpecialKeyMapping: {[key: string]: SpecialKeys} = {
  "OP": SpecialKeys.F1,
  "OQ": SpecialKeys.F2,
  "OR": SpecialKeys.F3,
  "OS": SpecialKeys.F4,
  "[15~": SpecialKeys.F5,
  "[17~": SpecialKeys.F6,
  "[18~": SpecialKeys.F7,
  "[19~": SpecialKeys.F8,
  "[20~": SpecialKeys.F9,
  "[21~": SpecialKeys.F10,
  "[23~": SpecialKeys.F11,
  "[24~": SpecialKeys.F12,
  "[H": SpecialKeys.HOME,
  "[A": SpecialKeys.UP,
  "[5~": SpecialKeys.PAGEUP,
  "[D": SpecialKeys.LEFT,
  "[C": SpecialKeys.RIGHT,
  "[F": SpecialKeys.END,
  "[B": SpecialKeys.DOWN,
  "[6~": SpecialKeys.PAGEDOWN,
  "[2~": SpecialKeys.INS,
  "[3~": SpecialKeys.DEL,
}
