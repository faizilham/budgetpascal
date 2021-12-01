import { FileMap } from "./files";

interface DemoConfig {
  program: string;
  binary: string;
  files: string[];
}

const demos: {[key: string]: DemoConfig} = {
  hangman: {
    program: "hangman.pas",
    binary: "",
    files: ["res/kata.dat", "res/user.dat"],
  }
};

export interface DemoData {
  code: string;
  binary: Uint8Array | null;
  files: FileMap
}

export function demoNames() {
  return Object.keys(demos);
}

async function getFile(demoName: string, filename: string) {
  const resource = `demos/${demoName}/${filename}`;
  const response = await fetch(resource);

  if (!response.ok) {
    throw new Error(`Error status ${response.status} for resource "${resource}""`);
  }

  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function fetchDemo(name: string): Promise<DemoData|null> {
  const demo = demos[name];
  if (!demo) return null;


  try {
    const programFile = await getFile(name, demo.program);
    const decoder = new TextDecoder();
    const code = decoder.decode(programFile);

    let binary = null;
    if (demo.binary !== "") {
      binary = await getFile(name, demo.binary);
    }

    let fileData = await Promise.all(demo.files.map(file => getFile(name, file)));
    const files: FileMap = {};
    for (let i = 0; i < demo.files.length; i++) {
      files[demo.files[i]] = fileData[i];
    }

    return {code, binary, files};
  } catch (e: any) {
    console.error(e.message);
    return null;
  }
}
