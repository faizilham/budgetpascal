import { clearCache, compileCode, runCode, setCache } from "./builder";

import "xterm/css/xterm.css";

import CodeMirror from "codemirror";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/material-darker.css";
import "codemirror/mode/pascal/pascal.js";
import "./style/main.scss"
import { TerminalUI } from "./terminal_ui";
import { Files } from "./files";
import { demoNames, fetchDemo } from "./demos";

const DEFAULT_WORKSPACE = "default";

interface State {
  workspace: string;
}

function init() {
  const editor = createEditor();
  const terminal = createTerminal();

  const files = new Files(DEFAULT_WORKSPACE);

  const states: State = {
    workspace: "hangman"
  };

  initRunButton(editor, terminal, files);

  //TODO: proper download button
  const downloadBtn = document.getElementById("btn-download") as HTMLElement;
  downloadBtn.addEventListener("click", () => {
    const data = files.files["res/user.dat"];
    downloadBlob(data, "user.dat");
  });

  //TODO: proper reset button
  const resetBtn = document.getElementById("btn-reset") as HTMLElement;
  resetBtn.addEventListener("click", () => {
    const confirmed = confirm("Reset Workspace? (This will reset code and input/output files)");
    if (!confirmed) return;

    loadDemo(states.workspace, editor, files);
  });

  loadWorkspace(states.workspace, editor, files);
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

function initRunButton(editor: CodeMirror.Editor, terminal: TerminalUI, files: Files) {
  const runButton = document.getElementById("btn-run") as HTMLElement;

  runButton.addEventListener("click", async () => {
    const code = editor.getValue();
    runButton.setAttribute("disabled", "true");
    terminal.clear();

    try {
      const binary = await compileCode(code, terminal);
      if (!binary) return;
      files.setCodeEntry(code, binary);
      await runCode(binary, terminal, files);

    } finally {
      runButton.removeAttribute("disabled");
    }
  })
}

async function loadWorkspace(workspace: string, editor: CodeMirror.Editor, files: Files) {
  files.workspace = workspace;

  const entry = await files.getCodeEntry();
  if (!entry) {
    if (workspace !== DEFAULT_WORKSPACE) {
      await loadDemo(workspace, editor, files);
    }
    return;
  }

  editor.setValue(entry.text);
  await files.loadFromStorage();

  if (entry.binary) {
    setCache(entry.text, entry.binary);
  } else {
    clearCache();
  }
}

async function loadDemo(name: string, editor: CodeMirror.Editor, files: Files) {
  const data = await fetchDemo(name);
  if (!data) return;

  editor.setValue(data.code);
  files.setCodeEntry(data.code, data.binary);
  files.setFiles(data.files);

  if (data.binary) {
    setCache(data.code, data.binary);
  } else {
    clearCache();
  }
}

function downloadBlob(data: Uint8Array, filename: string) {
  const mimetype = "application/octet-strean";

  const blob = new Blob([data], {type: mimetype});
  const url = URL.createObjectURL(blob);

  downloadURL(url, filename);

  setTimeout(() => {
    return URL.revokeObjectURL(url);
  }, 1000);
}

function downloadURL(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  a.remove();
}

init();
