import { clearCache, compileCode, runCode, setCache } from "./builder";

import "xterm/css/xterm.css";

import CodeMirror from "codemirror";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/material-darker.css";
import "codemirror/mode/pascal/pascal.js";
import "./style/main.scss"
import { TerminalUI } from "./terminal_ui";
import { Files } from "./files";
import { Demos, fetchDemo } from "./demos";
import Mithril from "mithril";

const DEFAULT_WORKSPACE = "default";

interface UIState {
  workspace: string;
  running: boolean;
  selectedFile: string | null
}

function init() {
  const editor = createEditor();
  const terminal = createTerminal();

  const files = new Files(DEFAULT_WORKSPACE);

  const states: UIState = {
    workspace: "hangman",
    running: false,
    selectedFile: null
  };

  initEditorMenu(states, editor, files, terminal);
  initFileList(states, files);
  initFileListMenu(states, files);

  loadWorkspace(states, editor, files);
};

/* UIs */

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
      const demos = Demos();
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
            state.workspace = e.target.value;
            loadWorkspace(state, editor, files);
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
          disabled: state.running,
          onclick: () => compileAndRun(state, editor, files, terminal)
        },
        "▶ Run"
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
      for (let filename of files.files.keys()) {
        items.push(fileItem(filename))
      }
      return Mithril(".filelist", items);
    }
  }

  Mithril.mount(container, fileList);
}

function initFileListMenu(state: UIState, files: Files) {
  const container = document.getElementById("filelist-menu-buttons") as HTMLElement;

  const addButton = () => {
    let onclick;
    return Mithril("button", { disabled: state.running, onclick }, "Add");
  };

  const renameButton = () => {
    let onclick;
    return Mithril("button", { disabled: state.running || !state.selectedFile, onclick }, "Rename");
  };

  const deleteButton = () => {
    let onclick;
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

async function compileAndRun(state: UIState, editor: CodeMirror.Editor, files: Files, terminal: TerminalUI) {
  state.running = true;
  const code = editor.getValue();
  terminal.clear();

  try {
    const binary = await compileCode(code, terminal);
    if (!binary) return;

    files.setCodeEntry(code, binary);
    await runCode(binary, terminal, files);
  } finally {
    state.running = false;
    Mithril.redraw();
  }
}

async function loadWorkspace(state: UIState, editor: CodeMirror.Editor, files: Files) {
  const workspace = state.workspace;
  files.workspace = workspace;
  state.selectedFile = null;

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

function downloadFile(state: UIState, files: Files) {
  if (!state.selectedFile) return;

  const data = files.files.get(state.selectedFile);
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
