import binaryen, { none } from "binaryen";

export namespace Runtime {
  export const DATA_ADDRESS = 0;
  export const BASE_STACK_ADDRESS = 65536;

  export const STACK_POINTER = "@sp";
  export const FRAME_POINTER = "@fp";

  export const PUTINT_FUNC = "$putint";
  export const PUTREAL_FUNC = "$putreal";
  export const PUTLN_FUNC = "$putln";
  export const PUTSTR_FUNC = "$putstr";

  export const PUTINT_MODE_INT = 0;
  export const PUTINT_MODE_CHAR = 1;
  export const PUTINT_MODE_BOOL = 2;
}

const importFunctions: {[key: string]: [number, number]} = {
  "$rtl.putint": [params(binaryen.i32, binaryen.i32), binaryen.none],
  "$rtl.putreal": [binaryen.f64, binaryen.none],
  "$rtl.putln": [binaryen.none, binaryen.none],
  "$rtl.putstr": [ binaryen.i32, binaryen.none],
}

export class RuntimeBuilder {
  private importsUsed: Set<string>
  constructor(private wasm: binaryen.Module) {
    this.importsUsed = new Set();
  }

  buildStack() {
    this.wasm.addGlobal(Runtime.STACK_POINTER, binaryen.i32, true,
      this.wasm.i32.const(Runtime.BASE_STACK_ADDRESS));

    this.buildPush();
    this.buildPop();
  }

  buildImports() {
    for (let func of this.importsUsed) {
      const [paramType, returnType] = importFunctions[func];
      const [modName, baseName] = func.slice(1).split('.');
      this.wasm.addFunctionImport(func, modName, baseName, paramType, returnType);
    }
  }

  /* Stack Managements */

  pushStack(bytes: number): number {
    return this.wasm.call("$push", [this.wasm.i32.const(bytes)], binaryen.none);
  }

  private buildPush() {
    this.wasm.addFunction("$push", binaryen.i32, binaryen.none, [],
      this.wasm.global.set(
        Runtime.STACK_POINTER,
        this.wasm.i32.add(
          this.wasm.global.get(Runtime.STACK_POINTER, binaryen.i32),
          this.wasm.local.get(0, binaryen.i32)
        )
      )
    );
  }

  popStack(bytes: number): number {
    return this.wasm.call("$pop", [this.wasm.i32.const(bytes)], binaryen.none);
  }

  private buildPop() {
    this.wasm.addFunction("$pop", binaryen.i32, binaryen.none, [],
      this.wasm.global.set(
        Runtime.STACK_POINTER,
        this.wasm.i32.sub(
          this.wasm.global.get(Runtime.STACK_POINTER, binaryen.i32),
          this.wasm.local.get(0, binaryen.i32)
        )
      )
    );
  }

  /* Imports */

  putInt(operand: number, mode: number): number {
    this.importsUsed.add("$rtl.putint");
    return this.wasm.call("$rtl.putint", [operand, this.wasm.i32.const(mode)], binaryen.none);
  }

  putReal(operand: number): number {
    this.importsUsed.add("$rtl.putreal");
    return this.wasm.call("$rtl.putreal", [operand], binaryen.none);
  }

  putStr(addr: number): number {
    this.importsUsed.add("$rtl.putstr");
    return this.wasm.call("$rtl.putstr", [addr], binaryen.none);
  }

  putLn(): number {
    this.importsUsed.add("$rtl.putln");
    return this.wasm.call("$rtl.putln", [], binaryen.none);
  }
}

function params(...types: number[]) {
  return binaryen.createType(types);
}
