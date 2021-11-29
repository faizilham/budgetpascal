export type ReadFileFunc = (filename: string) => Promise<Uint8Array | null>;
export type WriteFileFunc = (filename: string, data: Uint8Array) => Promise<boolean>;

interface FileData {
  filename: string;
  readmode: boolean;
  buffer: Uint8Array | null;
  length: number;
  position: number;
}

export enum FileHandlerStatus {
  OK = 1,
  NOT_FOUND,
  CLOSED,
  ALREADY_OPENED,
  NOT_ASSIGNED,
  READONLY,
  WRITEONLY,
  WRITE_ERROR,
  FILE_ENDED
}

export class FileHandler {
  private files: {[key in number]: FileData};
  constructor(private iobuffer: Int32Array, private read: ReadFileFunc, private write: WriteFileFunc) {
    this.files = {};
  }

  assign(id: number, filename: string) {
    this.files[id] = {
      filename,
      readmode: false,
      buffer: null,
      length: 0,
      position: 0
    };
  }

  async eof(id: number): Promise<FileHandlerStatus> {
    const file = this.files[id];
    if (!file) return FileHandlerStatus.NOT_ASSIGNED;
    if (!file.buffer) return FileHandlerStatus.CLOSED;

    const isEof = file.position === file.length ? 1 : 0;
    this.iobuffer[2] = isEof;
    return FileHandlerStatus.OK;
  }

  async reset(id: number): Promise<FileHandlerStatus> {
    const file = this.files[id];
    if (!file) return FileHandlerStatus.NOT_ASSIGNED;
    if (file.buffer) return FileHandlerStatus.ALREADY_OPENED;

    file.buffer = await this.read(file.filename);
    if (!file.buffer) return FileHandlerStatus.NOT_FOUND;

    file.length = file.buffer.length;
    file.position = 0;
    file.readmode = true;


    return FileHandlerStatus.OK;
  }

  async rewrite(id: number): Promise<FileHandlerStatus>  {
    const file = this.files[id];
    if (!file) return FileHandlerStatus.NOT_ASSIGNED;
    if (file.buffer) return FileHandlerStatus.ALREADY_OPENED;

    file.buffer = new Uint8Array(1024);
    file.length = 0;
    file.position = 0;
    file.readmode = false;

    return FileHandlerStatus.OK;
  }

  async readbyte(id: number, size: number): Promise<FileHandlerStatus> {
    const file = this.files[id];
    if (!file) return FileHandlerStatus.NOT_ASSIGNED;
    if (!file.buffer) return FileHandlerStatus.CLOSED;
    if (!file.readmode) return FileHandlerStatus.WRITEONLY;

    let bytesRead = 0;

    for (let i = 0; i < size; i++) {
      if (i + file.position >= file.length) break;
      this.iobuffer[i + 2] = file.buffer[i + file.position];
      bytesRead++;
    }

    file.position += bytesRead;
    this.iobuffer[1] = bytesRead;

    if (bytesRead !== size) return FileHandlerStatus.FILE_ENDED;

    return FileHandlerStatus.OK;
  }

  async readline(id: number): Promise<FileHandlerStatus> {
    const file = this.files[id];
    if (!file) return FileHandlerStatus.NOT_ASSIGNED;
    if (!file.buffer) return FileHandlerStatus.CLOSED;
    if (!file.readmode) return FileHandlerStatus.WRITEONLY;

    const maxBufferLength = this.iobuffer.length - 2;
    let readlength = 0;
    let i = 0;
    while(i + file.position < file.length) {
      readlength++;
      let read = file.buffer[i + file.position];
      this.iobuffer[i + 2] = read;
      i++;

      if (read === 10) break; // found newline
      if (readlength === maxBufferLength) break;
    }

    file.position += i;
    this.iobuffer[1] = readlength;

    return FileHandlerStatus.OK;
  }

  async writebyte(id: number, data: Uint8Array | string): Promise<FileHandlerStatus>  {
    const file = this.files[id];
    if (!file) return FileHandlerStatus.NOT_ASSIGNED;
    if (!file.buffer) return FileHandlerStatus.CLOSED;
    if (file.readmode) return FileHandlerStatus.READONLY;

    const length = data.length;

    file.length += length;
    if (file.length > file.buffer.length) {
      const old = file.buffer;
      file.buffer = new Uint8Array(old.length * 2);
      file.buffer.set(old);
    }

    if (data instanceof Uint8Array) {
      for (let i = 0; i < length; i++) {
        file.buffer[file.position + i] = data[i];
      }
    } else {
      for (let i = 0; i < length; i++) {
        file.buffer[file.position + i] = data.charCodeAt(i);
      }
    }

    file.position = file.length;

    return FileHandlerStatus.OK;
  }

  async close(id: number): Promise<FileHandlerStatus> {
    const file = this.files[id];
    if (!file) return FileHandlerStatus.NOT_ASSIGNED;
    if (!file.buffer) return FileHandlerStatus.CLOSED;

    if (!file.readmode) {
      const buffer = file.buffer.slice(0, file.length);
      const result = await this.write(file.filename, buffer);
      if (!result) {
        return FileHandlerStatus.WRITE_ERROR;
      }
    }

    file.buffer = null;

    return FileHandlerStatus.OK;
  }
}
