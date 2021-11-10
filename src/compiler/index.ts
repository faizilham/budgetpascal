import binaryen from "binaryen";
import { Emitter } from "./emitter";
import { Parser } from "./parser";
import { Scanner } from "./scanner";
import fs from "fs";

const debugWasm = true;

export function compile(source: string) : Uint8Array | undefined {
  // const mod = new binaryen.Module();
  // mod.addFunction("add", binaryen.createType([binaryen.i32, binaryen.i32]), binaryen.i32, [],
  //   mod.return(
  //     mod.i32.add(
  //       mod.local.get(0, binaryen.i32),
  //       mod.local.get(1, binaryen.i32)
  //     )
  //   )
  // );

  // mod.addFunctionExport("add", "add");

  // mod.optimize();
  // const binary = mod.emitBinary();

  const parser = new Parser(source);
  const program = parser.parse();

  if (!program) {
    return;
  }

  const emitter = new Emitter(program);
  const binary = emitter.emit();
  return binary;
}
