import { compileCode, runCode } from "./builder";

import "xterm/css/xterm.css";

import CodeMirror from "codemirror";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/material-darker.css";
import "codemirror/mode/pascal/pascal.js";
import "./style/main.scss"
import { TerminalUI } from "./terminal_ui";
import { Files } from "./files";

function init() {
  const editor = createEditor();
  const terminal = createTerminal();
  const files = new Files();
  initCompileButton(editor, terminal, files);
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

  return new TerminalUI(container);
}

function initCompileButton(editor: CodeMirror.Editor, terminal: TerminalUI, files: Files) {
  const compileButton = document.getElementById("btn-compile") as HTMLElement;

  compileButton.addEventListener("click", () => {
    const code = editor.getValue();
    compileButton.setAttribute("disabled", "true");
    terminal.clear();

    try {
      const binary = compileCode(code, terminal);
      if (!binary) return;
      runCode(binary, terminal, files);

    } finally {
      compileButton.removeAttribute("disabled");
    }
  })
}

init();
