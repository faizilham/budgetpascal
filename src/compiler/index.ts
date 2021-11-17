import { Emitter } from "./emitter";
import { Parser } from "./parser";

const debugWasm = true;

export function compile(source: string) : Uint8Array | undefined {
  const parser = new Parser(source);
  const program = parser.parse();

  if (!program) {
    return;
  }

  const emitter = new Emitter(program);
  const binary = emitter.emit();
  return binary;
}
