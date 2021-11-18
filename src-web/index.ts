import {compile} from "../src/";

import {Terminal} from "xterm";
import "xterm/css/xterm.css";

import CodeMirror from "codemirror";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/material-darker.css";
import "codemirror/mode/pascal/pascal.js";
import "./style/main.scss"

function init() {
  const editor = createEditor();
  const terminal = createTerminal();
  initCompileButton(editor, terminal);
};

function createEditor() {
  const container = document.getElementById("editor-container") as HTMLElement;
  container.replaceChildren(); // clean content

  return CodeMirror(container, {
    lineNumbers: true,
    theme: "material-darker",
    mode: "pascal",
    tabSize: 2
  });
}

function createTerminal() {
  const container = document.getElementById("xterm-container") as HTMLElement;
  container.replaceChildren(); // clean content;

  const terminal = new Terminal({
    theme: {background: "#222", cursor: "#222"},
    fontFamily: "'Consolas', monospace",
    cursorStyle: "bar",
  });
  terminal.open(container);


  return terminal;
}

function initCompileButton(editor: CodeMirror.Editor, terminal: Terminal) {
  const compileButton = document.getElementById("btn-compile") as HTMLElement;

  const logger = {
    error(...messages: any[]): void {
      const data = messages.join(" ");
      terminal.writeln(data);
    }
  }

  let memory: any;
  const importObject = {
    rtl: {
      $putint: (n: number, mode: number) => {
        switch(mode) {
          case 1: terminal.write(String.fromCharCode(n)); break;
          case 2: terminal.write( n === 0 ? "FALSE" : "TRUE"); break;
          default:
            terminal.write(n.toString());
        }
      },
      $putreal: (x: number) => { terminal.write(x.toExponential()); },
      $putln: () => { terminal.write("\n\r") },
      $putstr: (addr: number) => {
        let mem = memory as Uint8Array;
        const start = addr + 1;
        const end = start + mem[addr];

        terminal.write(mem.slice(start, end));
      }
    }
  };

  let lastCode = ""; let lastBinary: Uint8Array | undefined;

  compileButton.addEventListener("click", () => {
    const code = editor.getValue();
    compileButton.setAttribute("disabled", "true");
    terminal.clear();
    try {
      let binary;
      if (code === lastCode) {
        binary = lastBinary;
      } else {
        terminal.writeln("Compiling...");
        binary = compile(code, logger);
      }

      if (!binary) return;

      lastCode = code;
      lastBinary = binary;

      terminal.writeln("Running...");
      const mod = new WebAssembly.Module(binary);
      const instance = new WebAssembly.Instance(mod, importObject);
      memory = new Uint8Array((instance.exports.mem as WebAssembly.Memory).buffer);

      const main: any = instance.exports.main;
      main();

    } finally {
      compileButton.removeAttribute("disabled");
    }
  })
}

init();
