import { clearCache, compileCode, runCode, setCache } from "./builder";

import "xterm/css/xterm.css";

import CodeMirror from "codemirror";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/material-darker.css";
import "codemirror/mode/pascal/pascal.js";
import "./style/main.scss"
import { TerminalUI } from "./terminal_ui";
import { Files } from "./files";
import { demoExists, getDemos, fetchDemo } from "./demos";
import Mithril from "mithril";

const DEFAULT_WORKSPACE = "default";

interface UIState {
  workspace: string;
  running: boolean;
  compiling: boolean;
  selectedFile: string | null
}

function init() {
  const editor = createEditor();
  const terminal = createTerminal();

  const files = new Files(DEFAULT_WORKSPACE);

  const state: UIState = {
    workspace: "default",
    running: false,
    compiling: false,
    selectedFile: null
  };

  initEditorMenu(state, editor, files, terminal);
  initFileList(state, files);
  initFileListMenu(state, files);

  processHashLocation(state, editor, files, terminal, true);

  window.onhashchange = () => processHashLocation(state, editor, files, terminal, false);
};

/* UIs */

function processHashLocation(state: UIState, editor: CodeMirror.Editor, files: Files, terminal: TerminalUI, firstTime: boolean) {
  const hash = location.hash;
  let workspaceName = hash.slice(1);

  if (!demoExists(workspaceName)) {
    workspaceName = DEFAULT_WORKSPACE;
  }

  if (state.running) return;

  if (firstTime || workspaceName !== state.workspace) {
    state.workspace = workspaceName;
    loadWorkspace(state, editor, files, terminal);
  }
}

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

function initEditorMenu(state: UIState, editor: CodeMirror.Editor, files: Files, terminal: TerminalUI) {
  const container = document.getElementById("code-menu-buttons") as HTMLElement;

  const menu = {
    view: function() {
      return Mithril("span", [
        workspaceSelector(state, editor, files),
        " ",
        resetButton(state, editor, files),
        " ",
        runButton(state, editor, files, terminal),
      ]);
    }
  }

  Mithril.mount(container, menu);
}

function workspaceSelector(state: UIState, editor: CodeMirror.Editor, files: Files) {
  return Mithril({
    view: function() {

      const children = [];
      const demos = getDemos();
      for (let [name, entry] of Object.entries(demos)) {
        children.push(Mithril(
          "option",
          {
            value: name,
            selected: state.workspace === name ? "selected" : undefined
          },
          entry.displayName
        ))
      }

      return Mithril(
        "select",
        {
          value: state.workspace,
          disabled: state.running,
          onchange: (e: any) => {
            location.hash = "#" + e.target.value;
          }
        },
        children
      );
    }
  });
}

function resetButton(state: UIState, editor: CodeMirror.Editor, files: Files) {
  return Mithril({
    view: function() {
      return Mithril("button", {
        disabled: state.running,
        onclick: () => resetWorkspace(state, editor, files)
      }, "↩ Reset");
    }
  });
}

function runButton(state: UIState, editor: CodeMirror.Editor, files: Files, terminal: TerminalUI) {
  return Mithril({
    view: function() {


      return Mithril(
        "button",
        {
          disabled: state.running && state.compiling,
          onclick: () => {
            if (!state.running) {
              compileAndRun(state, editor, files, terminal)
            } else {
              stopExecution();
            }
          }
        },
        state.running && !state.compiling ? "◼️ Stop" : "▶ Run"
      );
    }
  });
}

function initFileList(state: UIState, files: Files) {
  const container = document.querySelector(".filelist-container") as HTMLElement;

  const fileItem = (filename: string) => {
    let classnames = "fileitem";
    if (filename === state.selectedFile) classnames += " fileitem-selected";
    return Mithril("div",
    {
      key: filename,
      class: classnames,
      onclick: () => {
        state.selectedFile = filename;
      }
    }, filename)
  }

  const fileList = {
    view: function() {
      const items = [];
      for (let filename of files.filemap.keys()) {
        items.push(fileItem(filename))
      }
      return Mithril(".filelist", items);
    }
  }

  Mithril.mount(container, fileList);
}

function initFileListMenu(state: UIState, files: Files) {
  const container = document.getElementById("filelist-menu-buttons") as HTMLElement;
  const fileSelector = document.getElementById("file-selector") as HTMLElement;

  fileSelector.addEventListener("change", async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const inputFile = target.files;

    if (!inputFile || !inputFile[0]) return;

    await addFile(state, files, inputFile[0]);
    target.value = "";
  });

  const addButton = () => {
    let onclick = () => fileSelector.click();
    return Mithril("button", { disabled: state.running, onclick }, "Add");
  };

  const renameButton = () => {
    let onclick = () => renameFile(state, files);
    return Mithril("button", { disabled: state.running || !state.selectedFile, onclick }, "Rename");
  };

  const deleteButton = () => {
    let onclick = () => deleteFile(state, files);
    return Mithril("button", { disabled: state.running || !state.selectedFile, onclick }, "Delete");
  };

  const downloadButton = () => {
    let onclick = () => downloadFile(state, files);
    return Mithril("button", { disabled: !state.selectedFile, onclick }, "Save to Disk");
  };

  const menu = {
    view: function() {
      return Mithril("span", [
        addButton(),
        " ",
        renameButton(),
        " ",
        deleteButton(),
        " ",
        downloadButton()
      ]);
    }
  };

  Mithril.mount(container, menu);
}

/* functionalities */

let stopFunction: Function | null = null;
function stopExecution() {
  if (!stopFunction) return;

  stopFunction(); // runCode promise will be resolved by stopFunction
  stopFunction = null;
}

async function compileAndRun(state: UIState, editor: CodeMirror.Editor, files: Files, terminal: TerminalUI) {
  state.running = true;
  state.compiling = true;
  const code = editor.getValue();
  terminal.clear();

  try {
    const binary = await compileCode(code, terminal);
    files.setCodeEntry(code, binary);
    state.compiling = false;
    if (!binary) return;

    Mithril.redraw(); // to update compiling status

    const [promise, stopFunc] = runCode(binary, terminal, files) as [Promise<void>, Function];
    stopFunction = stopFunc;
    await promise;

  } finally {
    stopFunction = null;
    state.running = false;
    Mithril.redraw();
  }
}

async function loadWorkspace(state: UIState, editor: CodeMirror.Editor, files: Files, terminal: TerminalUI) {
  const workspace = state.workspace;
  files.workspace = workspace;
  state.selectedFile = null;
  terminal.clear();

  const entry = await files.getCodeEntry();
  if (!entry) {
    return loadDemo(state, editor, files);
  }

  editor.setValue(entry.text);
  await files.loadFromStorage();

  if (entry.binary) {
    setCache(entry.text, entry.binary);
  } else {
    clearCache();
  }

  Mithril.redraw();
}

async function loadDemo(state: UIState, editor: CodeMirror.Editor, files: Files) {
  const data = await fetchDemo(state.workspace);
  if (!data) return;

  editor.setValue(data.code);
  files.setCodeEntry(data.code, data.binary);
  files.setFiles(data.files);

  if (data.binary) {
    setCache(data.code, data.binary);
  } else {
    clearCache();
  }

  Mithril.redraw();
}

function resetWorkspace(state: UIState, editor: CodeMirror.Editor, files: Files) {
  const confirmed = confirm("Reset Workspace? (This will reset code and input/output files)");
  if (!confirmed) return;

  state.selectedFile = null;
  loadDemo(state, editor, files);
}

async function addFile(state: UIState, files: Files, inputFile: File) {
  const readPromise = new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => { resolve(reader.result as ArrayBuffer); }
    reader.onerror = reject;

    reader.readAsArrayBuffer(inputFile);
  });

  try {
    const buffer = await readPromise;
    if (!buffer) return;

    const data = new Uint8Array(buffer);
    const filename = inputFile.name;
    files.write(filename, data);
    state.selectedFile = filename;

    Mithril.redraw();

  } catch (e: any) {
    console.error(e);
  }
}

function renameFile(state: UIState, files: Files) {
  const oldFilename = state.selectedFile;
  if (!oldFilename) return;
  let newFilename = prompt(`New filename for ${oldFilename}:`, oldFilename);
  if (!newFilename || newFilename === oldFilename) return;

  if (files.filemap.has(newFilename)) {
    alert(`File "${newFilename}" already exists!`);
    return;
  }

  files.rename(oldFilename, newFilename);
  state.selectedFile = newFilename;
}

function deleteFile(state: UIState, files: Files) {
  const filename = state.selectedFile;
  if (!filename) return;

  if (!confirm(`Delete "${filename}"?`)) return;

  files.delete(filename);
  state.selectedFile = null;
}

function downloadFile(state: UIState, files: Files) {
  if (!state.selectedFile) return;

  const data = files.filemap.get(state.selectedFile);
  if (!data) return;

  const path = state.selectedFile.split(/[\/\\]/g);
  const filename = path[path.length - 1];

  downloadBlob(data, filename);
}

function downloadBlob(data: Uint8Array, filename: string) {
  const mimetype = "application/octet-strean";

  const blob = new Blob([data], {type: mimetype});
  const url = URL.createObjectURL(blob);

  // simulate url click
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  a.remove();

  setTimeout(() => {
    return URL.revokeObjectURL(url);
  }, 1000);
}

init();
