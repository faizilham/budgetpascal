import Dexie from "dexie";

export type FileMap = Map<string, Uint8Array>

export class Files {
  files: FileMap;
  storage: WorkspaceStorage;
  workspace: string;
  constructor(initialWorkspace: string) {
    this.files = new Map();
    this.storage = new WorkspaceStorage();
    this.workspace = initialWorkspace;
  }

  setCodeEntry(code: string, binary: Uint8Array | null) {
    this.storage.setCode(this.workspace, code, binary);
  }

  getCodeEntry() {
    return this.storage.getCode(this.workspace);
  }

  setFiles(files: FileMap) {
    this.files = files;
    const workspace = this.workspace;
    this.storage.clearFiles(workspace);

    const fileEntries = [];
    for (let [filename, content] of files.entries()) {
      fileEntries.push({workspace, filename, content});
    }

    this.storage.putFiles(fileEntries);
  }

  async loadFromStorage() {
    const files = await this.storage.getFiles(this.workspace);
    this.files.clear();

    if (!files) return;

    for (let file of files) {
      this.files.set(file.filename, file.content);
    }
  }

  read(filename: string): Uint8Array | null {
    return this.files.get(filename) || null;
  }

  write(filename: string, data: Uint8Array): boolean {
    this.files.set(filename, data);
    this.storage.putFile(this.workspace, filename, data);
    return true;
  }

  delete(filename: string) {
    if (!this.files.has(filename)) return;
    this.files.delete(filename);
    this.storage.deleteFile(this.workspace, filename);
  }
}

interface FileEntries { workspace: string, filename: string, content: Uint8Array }

class WorkspaceStorage {
  private db: Dexie;
  constructor() {
    this.db = new Dexie("BudgetPascalWorkspace");
    this.db.version(1).stores({
      files: "++id, [workspace+filename], content",
      codes: "&workspace, text, binary",
    });
  }

  async setCode(workspace: string, text: string, binary: Uint8Array | null) {
    const result = await this.db.table("codes").where({ workspace}).modify({ text, binary });
    if (result < 1) {
      await this.db.table("codes").add({ workspace, text, binary });
    }
  }

  async getCode(workspace: string) {
    return this.db.table("codes").get({ workspace });
  }

  async clearFiles(workspace: string) {
    await this.db.table("files").where({ workspace }).delete();
  }

  async deleteFile(workspace: string, filename: string) {
    await this.db.table("files").where({ workspace, filename }).delete();
  }

  async putFile(workspace: string, filename: string, content: Uint8Array) {
    await this.db.table("files").put({workspace, filename, content});
  }

  async putFiles(entries: FileEntries[]) {
    await this.db.table("files").bulkPut(entries);
  }

  async getFiles(workspace: string) {
    return this.db.table("files").where({ workspace }).toArray();
  }
}
