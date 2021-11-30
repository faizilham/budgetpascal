export class Files {
  files: {[key: string]: Uint8Array}
  constructor(initialFiles = {}) {
    this.files = initialFiles;
  }

  read(filename: string): Uint8Array | null {
    return this.files[filename] || null;
  }

  write(filename: string, data: Uint8Array): boolean {
    this.files[filename] = data;
    return true;
  }
}
