import binaryen from "binaryen";
import { Scanner } from "./scanner";

export function compile() : WebAssembly.Module {
  const mod = new binaryen.Module();
  mod.addFunction("add", binaryen.createType([binaryen.i32, binaryen.i32]), binaryen.i32, [],
    mod.return(
      mod.i32.add(
        mod.local.get(0, binaryen.i32),
        mod.local.get(1, binaryen.i32)
      )
    )
  );

  mod.addFunctionExport("add", "add");

  mod.optimize();
  const binary = mod.emitBinary();

  return new WebAssembly.Module(binary);
}
