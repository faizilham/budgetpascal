import { compileCode, runCode } from "./builder";

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

  compileButton.addEventListener("click", () => {
    const code = editor.getValue();
    compileButton.setAttribute("disabled", "true");
    terminal.clear();

    try {
      const binary = compileCode(code, terminal);
      if (!binary) return;
      runCode(binary, terminal);

    } finally {
      compileButton.removeAttribute("disabled");
    }
  })
}

init();
