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

    this.wasm.setFeatures(binaryen.Features.BulkMemory);

    this.buildPush();
    this.buildPop();
    this.buildCopyString();
    this.buildAppendString();
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

  stackTop(): number {
    return this.wasm.global.get(Runtime.STACK_POINTER, binaryen.i32);
  }

  restoreStackTop(expr: number): number {
    return this.wasm.global.set(Runtime.STACK_POINTER, expr);
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

  copyString(target: number, maxSize: number, source: number, preserveStack: boolean): number {
    return this.wasm.call("$copyString",
      [target, this.wasm.i32.const(maxSize), source, this.wasm.i32.const(preserveStack ? 1 : 0)],
      binaryen.none);
  }

  private buildCopyString() {
    // params: 0 target, 1 max_size, 2 source, 3 preserve_stack
    const target = 0;
    const max_size = 1;
    const source = 2;
    const preserve_stack = 3;
    const last_stack_top = 4;

    const setlocal = (id: number, val: number) => this.wasm.local.set(id, val);
    const getlocal = (id: number) => this.wasm.local.get(id, binaryen.i32);
    const setmem = (ptr: number, val: number) => this.wasm.i32.store8(0, 1, ptr, val);
    const constant = (val: number) => this.wasm.i32.const(val);

    this.wasm.addFunction("$copyString", params(binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32),
      binaryen.none, [binaryen.i32], this.wasm.block("", [
       // last_stack_top = sp
       setlocal(last_stack_top, this.stackTop()),

       // mem[target] = 0
       setmem(getlocal(target), constant(0)),
       this.wasm.call("$appendString", [getlocal(target), getlocal(max_size), getlocal(source)],
          binaryen.none),

       // if (!preserve_stack) return
       this.wasm.if(this.wasm.i32.eqz(getlocal(preserve_stack)), this.wasm.return()),

       // sp = last_stack_top
       this.restoreStackTop(getlocal(last_stack_top))
     ]));
  }

  appendString(target: number, maxSize: number, source: number): number {
    return this.wasm.call("$appendString", [target, this.wasm.i32.const(maxSize), source],
        binaryen.none);
  }

  private buildAppendString() {
    // params: 0 target, 1 max_size, 2 source

    const target = 0;
    const max_size = 1;
    const source = 2;
    const target_length = 3
    const target_start = 4;
    const source_length = 5;
    const source_start = 6;
    const remaining = 7;

    const setlocal = (id: number, val: number) => this.wasm.local.set(id, val);
    const getlocal = (id: number) => this.wasm.local.get(id, binaryen.i32);
    const constant = (val: number) => this.wasm.i32.const(val);
    const add = (left: number, right: number) => this.wasm.i32.add(left, right);
    const sub = (left: number, right: number) => this.wasm.i32.sub(left, right);
    const getmem = (ptr: number) => this.wasm.i32.load8_u(0, 1, ptr)
    const setmem = (ptr: number, val: number) => this.wasm.i32.store8(0, 1, ptr, val);

    this.wasm.addFunction("$appendString", params(binaryen.i32, binaryen.i32, binaryen.i32), binaryen.none,
      [binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32],
      // 3 target_length, 4 target_start, 5 source_length, 6 source_start, 7 remaining
      this.wasm.block("", [
        // target_length = mem[target]
        setlocal(target_length, getmem(getlocal(target))),

        // target_start = target + target_length + 1
        setlocal(target_start, add(add(getlocal(target), getlocal(target_length)), constant(1))),

        // source_length = mem[source]
        setlocal(source_length, getmem(getlocal(source))),

        // source_start = source + 1
        setlocal(source_start, add(getlocal(source), constant(1))),

        // remaining = max_size - target_length
        setlocal(remaining, sub(getlocal(max_size), getlocal(target_length))),

        // if (source_length > remaining)):
        this.wasm.if(this.wasm.i32.gt_s(getlocal(source_length), getlocal(remaining)),
          // source_length = remaining
          setlocal(source_length, getlocal(remaining))
        ),

        // if (source_length == 0): return
        this.wasm.if(this.wasm.i32.eq(getlocal(source_length), constant(0)),
          this.wasm.return()
        ),

        // memcopy(target_start, source_start, source_length)
        this.wasm.memory.copy(getlocal(target_start), getlocal(source_start), getlocal(source_length)),

        // mem[target] = target_length + source_length
        setmem(getlocal(target), add(getlocal(target_length), getlocal(source_length)))
      ])
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
