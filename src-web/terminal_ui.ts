import {Terminal} from "xterm";
import ansi from 'ansi-escapes';
import {SpecialKeys, PascalSpecialKeys} from "../src/keyboard_map";

const ESCAPE_KEY = 0x1b;

type ResolveFunc = ((result: string|null) => void);
enum ReadMode {NONE, LINE, KEY, POS};

export class TerminalUI {
  terminal: Terminal;
  cursorShown: boolean;
  private readResolver: ResolveFunc | null;
  private readline: string;
  private readcursor: number;

  private readMode: ReadMode;

  constructor(container: HTMLElement) {
    this.terminal = new Terminal({
      theme: {background: "#222", cursor: "#222"},
      fontFamily: "'Consolas', monospace",
      cursorBlink: false
    });

    this.cursorShown = false;

    this.readResolver = null;
    this.readline = "";
    this.readcursor = 0;

    this.readMode = ReadMode.NONE;

    this.terminal.onData((data) => this.handleData(data));

    this.terminal.open(container);
  }

  private clearReadMode() {
    this.readMode = ReadMode.NONE;
  }

  private handleData(data: string) {
    switch (this.readMode) {
      case ReadMode.KEY: return this.handleKey(data);
      case ReadMode.LINE: return this.handleReadline(data);
      case ReadMode.POS: return this.handleGetCursorPos(data);
    }
  }

  private startGetCursorPos() {
    this.readMode = ReadMode.POS;
    this.terminal.write(ansi.cursorGetPosition);
    return new Promise<string|null>((resolver) => {
      this.readResolver = resolver;
    })
  }

  private handleGetCursorPos(data: string) {
    this.clearReadMode();
    (this.readResolver as ResolveFunc)(data);
  }


  private startReadkey() {
    this.readMode = ReadMode.KEY;
    return new Promise<string|null>((resolve) => {
      this.readResolver = resolve;
    })
  }

  private handleKey(key: string) {
    this.clearReadMode();

    if (key === '\r' || key === '\n') {
      this.terminal.write(ansi.cursorDown(1));
    }

    (this.readResolver as ResolveFunc)(key);
  }

  private startRead() {
    this.readMode = ReadMode.LINE;
    this.readline = "";
    this.readcursor = 0;

    return new Promise<string|null>((resolve) => {
      this.readResolver = resolve;
    });
  }

  private finishRead(interrupted: boolean) {
    let result = null;
    if (!interrupted) {
      result = this.readline + "\n";
    }

    this.clearReadMode();

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

  private handleReadline(data: string) {
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
        case "\r": { // ENTER
          this.moveReadCursor(this.readline.length);
          this.terminal.write("\r\n");
          this.finishRead(false);
          break;
        }

        case "\x7F": // BACKSPACE
          this.handleErase(true);
        break;

        case "\t": // TAB
          this.insertData("    ");
        break;

        case "\x03": { // CTRL+C
          this.moveReadCursor(this.readline.length);
          this.terminal.write("^C\r\n");
          this.finishRead(true);
          break;
        }
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

  stop() {
    this.showCursor(false);
    this.clearReadMode();
    if (this.readResolver) this.readResolver(null);
  }

  clear() {
    this.terminal.write(ansi.clearTerminal);
  }

  gotoXY(x: number, y: number) {
    this.terminal.write(ansi.cursorTo(x - 1, y - 1));
  }

  async cursorPos() {
    const result = await this.startGetCursorPos();
    // format: E[y;xR where E = escape char; x, y = position

    let y = 0;
    let x = 0;
    if (result) {
      const pos = result.slice(2, result.length - 1).split(';');
      y = parseInt(pos[0], 10);
      x = parseInt(pos[1], 10);

      if (isNaN(x) || isNaN(y)) {
        y = 0;
        x = 0;
      }
    }

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
