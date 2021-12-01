export type FileMap = {[key:string]: Uint8Array};

export class Files {
  files: FileMap
  constructor(initialFiles = {}) {
    this.files = initialFiles;
  }

  setFiles(files: FileMap) {
    this.files = files;
  }

  read(filename: string): Uint8Array | null {
    return this.files[filename] || null;
  }

  write(filename: string, data: Uint8Array): boolean {
    this.files[filename] = data;
    return true;
  }
}
