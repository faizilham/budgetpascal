import binaryen from "binaryen";

export namespace Runtime {
  export const DATA_ADDRESS = 0;
  export const BASE_FRAME_POINTER = 65536;
  export const MAX_FRAME = 256;
  export const BASE_STACK_ADDRESS = Runtime.BASE_FRAME_POINTER + Runtime.MAX_FRAME * 4;

  export const STACK_POINTER = "@sp";
  export const FRAME_POINTER = "@fp";

  export const PUTINT_MODE_INT = 0;
  export const PUTINT_MODE_CHAR = 1;
  export const PUTINT_MODE_BOOL = 2;
}

const importFunctions: {[key: string]: [number, number]} = {
  "rtl.$putint": [params(binaryen.i32, binaryen.i32), binaryen.none],
  "rtl.$putreal": [binaryen.f64, binaryen.none],
  "rtl.$putln": [binaryen.none, binaryen.none],
  "rtl.$putstr": [ binaryen.i32, binaryen.none],

  "rtl.$readint": [binaryen.none, binaryen.i32],
  "rtl.$readchar": [binaryen.none, binaryen.i32],
  "rtl.$readreal": [binaryen.none, binaryen.f64],
  "rtl.$readstr": [params(binaryen.i32, binaryen.i32), binaryen.none],
  "rtl.$readln": [binaryen.none, binaryen.none],
};

export class RuntimeBuilder {
  private importsUsed: Set<string>
  constructor(private wasm: binaryen.Module) {
    this.importsUsed = new Set();
  }

  buildStack() {
    this.wasm.addGlobal(Runtime.STACK_POINTER, binaryen.i32, true,
      this.wasm.i32.const(Runtime.BASE_STACK_ADDRESS));
    this.wasm.addGlobal(Runtime.FRAME_POINTER, binaryen.i32, true,
      this.wasm.i32.const(Runtime.BASE_FRAME_POINTER));

    this.wasm.setFeatures(binaryen.Features.BulkMemory | binaryen.Features.Multivalue);

    this.buildPush();
    this.buildPop();
    this.buildPushFrame();
    this.buildPopFrame();
    this.buildLastCallframeById();
    this.buildPreserveStack();

    this.buildCopyString();
    this.buildAppendString();
    this.buildCharToStr();
    this.buildCompareStr();
  }

  buildImports() {
    for (let func of this.importsUsed) { // TODO: honestly, not needed. it will be optimized anyway
      const [paramType, returnType] = importFunctions[func];
      const [modName, baseName] = func.split('.');
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

  preserveStack(exprInstr: number): number {
    const sp = this.stackTop();
    const exprType = binaryen.getExpressionType(exprInstr);
    let name = "$preserveStack.i32";
    if (exprType === binaryen.f64) {
      name = "$preserveStack.f64";
    }

    return this.wasm.call(name, [sp, exprInstr], exprType);
  }

  private buildPreserveStack() {
    this.wasm.addFunction("$preserveStack.i32", params(binaryen.i32, binaryen.i32), binaryen.i32, [],
    this.wasm.block("", [
      this.restoreStackTop(this.wasm.local.get(0, binaryen.i32)),
      this.wasm.local.get(1, binaryen.i32)
    ], binaryen.i32));

    this.wasm.addFunction("$preserveStack.f64", params(binaryen.i32, binaryen.f64), binaryen.f64, [],
    this.wasm.block("", [
      this.restoreStackTop(this.wasm.local.get(0, binaryen.i32)),
      this.wasm.local.get(1, binaryen.f64)
    ], binaryen.f64));
  }

  frameTop(): number {
    return this.wasm.global.get(Runtime.FRAME_POINTER, binaryen.i32);
  }

  callframeStackTop(): number {
    // sp relative to frame = mem[fp-8]
    return this.wasm.i32.load(0, 4,
      this.wasm.i32.sub(this.frameTop(), this.wasm.i32.const(8)));
  }

  lastCallframeById(funcId: number): number {
    // return last callframe's stack pointer where callframe.id = funcId
    return this.wasm.call("$lcfid", [this.wasm.i32.const(funcId)], binaryen.i32);
  }

  private buildLastCallframeById() {
    // params: 0 funcId; return i32
    const funcId = 0;
    const currentPos = 1;

    const wasm = this.wasm;

    const constant = (cons: number) => wasm.i32.const(cons);
    const getlocal = (id: number) => wasm.local.get(id, binaryen.i32);
    const setlocal = (id: number, expr: number) => wasm.local.set(id, expr);
    const subBy = (expr: number, cons: number) => wasm.i32.sub(expr, constant(cons));
    const decr = (id: number, cons: number) => setlocal(id, subBy(getlocal(id), cons));
    const getmem = (offset: number, ptr: number) => wasm.i32.load(offset, 4, ptr);

    const looplabel = "$lcfid.loop";

    wasm.addFunction("$lcfid", binaryen.i32, binaryen.i32, [binaryen.i32],
      wasm.block("", [
        // currentPos = fp
        setlocal(currentPos, this.frameTop()),
        wasm.loop(looplabel, wasm.block("", [
          // currentPos -= 8
          decr(currentPos, 8),

          // if currentPos < base_fp return -1
          wasm.if(wasm.i32.lt_s(getlocal(currentPos), constant(Runtime.BASE_FRAME_POINTER)),
            wasm.return(constant(-1)) // TODO: exception??
          ),

          // if mem[currentPos + 4] == funcId
          wasm.if(wasm.i32.eq(getmem(4, getlocal(currentPos)), getlocal(funcId)),
            // return mem[currentPos]
            wasm.return(getmem(0, getlocal(currentPos)))
          ),

          // loopback
          wasm.br(looplabel)
        ]))
      ])
    );
  }

  setFrameTop(expr: number): number {
    return this.wasm.global.set(Runtime.FRAME_POINTER, expr);
  }

  pushFrame(funcId: number) {
    return this.wasm.call("$pushcf", [ this.wasm.i32.const(funcId) ], binaryen.none);
  }

  private buildPushFrame() {
    // params: 0 funcId
    // mem[fp] = sp; mem[fp + 4] = funcId; fp += 8
    const funcId = 0;

    this.wasm.addFunction("$pushcf", binaryen.i32, binaryen.none, [],
      this.wasm.block("", [
        this.wasm.i32.store(0, 4, this.frameTop(), this.stackTop()),
        this.wasm.i32.store(4, 4, this.frameTop(), this.wasm.local.get(funcId, binaryen.i32)),
        this.setFrameTop(this.wasm.i32.add(this.frameTop(), this.wasm.i32.const(8)))
      ])
    );
  }

  popFrame() {
    return this.wasm.call("$popcf", [], binaryen.none);
  }

  private buildPopFrame() {
    // fp -= 8; sp = mem[fp]

    this.wasm.addFunction("$popcf", binaryen.none, binaryen.none, [],
      this.wasm.block("", [
        this.setFrameTop(this.wasm.i32.sub(this.frameTop(), this.wasm.i32.const(8))),
        this.restoreStackTop(
          this.wasm.i32.load(0, 4, this.frameTop())
        )
      ])
    );
  }

  debugPrintStackTop(): number {
    const constant = (c: number) => this.wasm.i32.const(c);
    return this.wasm.block("", [
      this.putInt(constant(83), Runtime.PUTINT_MODE_CHAR),
      this.putInt(constant(80), Runtime.PUTINT_MODE_CHAR),
      this.putInt(constant(58), Runtime.PUTINT_MODE_CHAR),
      this.putInt(constant(32), Runtime.PUTINT_MODE_CHAR),
      this.putInt(this.stackTop(), Runtime.PUTINT_MODE_INT),
      this.putLn()
    ]);
  }

  /* String Operations */

  copyString(target: number, maxSize: number, source: number): number {
    return this.wasm.call("$copyString",
      [target, this.wasm.i32.const(maxSize), source],
      binaryen.none);
  }

  private buildCopyString() {
    // params: 0 target, 1 max_size, 2 source,
    const target = 0;
    const max_size = 1;
    const source = 2;

    const setlocal = (id: number, val: number) => this.wasm.local.set(id, val);
    const getlocal = (id: number) => this.wasm.local.get(id, binaryen.i32);
    const setmem = (ptr: number, val: number) => this.wasm.i32.store8(0, 1, ptr, val);
    const constant = (val: number) => this.wasm.i32.const(val);

    this.wasm.addFunction("$copyString", params(binaryen.i32, binaryen.i32, binaryen.i32),
      binaryen.none, [], this.wasm.block("", [
       // mem[target] = 0
       setmem(getlocal(target), constant(0)),
       this.wasm.call("$appendString", [getlocal(target), getlocal(max_size), getlocal(source)],
          binaryen.none),
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

  charToStr(charValue: number): number {
    return this.wasm.call("$charToStr", [charValue], binaryen.i32);
  }

  private buildCharToStr() {
    // params: 0 charValue
    // return: pointer to string
    const charValue = 0;
    const ptr = 1;

    const setlocal = (id: number, val: number) => this.wasm.local.set(id, val);
    const getlocal = (id: number) => this.wasm.local.get(id, binaryen.i32);
    const setmem = (ptr: number, val: number) => this.wasm.i32.store8(0, 1, ptr, val);
    const constant = (val: number) => this.wasm.i32.const(val);
    this.wasm.addFunction("$charToStr", binaryen.i32, binaryen.i32, [binaryen.i32], this.wasm.block("", [

      // ptr = sp; returnValue = ptr
      setlocal(ptr, this.stackTop()),

      // sp += 2
      this.pushStack(2),

      // mem[ptr] = 1
      setmem(getlocal(ptr), constant(1)),

      // mem[ptr + 1] = charValue
      setmem(this.wasm.i32.add(getlocal(ptr), constant(1)), getlocal(charValue)),

      // return ptr
      this.wasm.return(getlocal(ptr)),
    ]));
  }

  compareStr(ptr1: number, ptr2: number): number {
    return this.wasm.call("$compareStr", [ptr1, ptr2], binaryen.i32);
  }

  private buildCompareStr(){
    // params: 0 ptr1, 1 ptr2
    const wasm = this.wasm;

    const ptr1 = 0;
    const ptr2 = 1;
    const length1 = 2;
    const length2 = 3;
    const end1 = 4;
    const end2 = 5;
    const c1 = 6;
    const c2 = 7;

    const setlocal = (id: number, val: number) => wasm.local.set(id, val);
    const getlocal = (id: number) => wasm.local.get(id, binaryen.i32);
    const constant = (val: number) => wasm.i32.const(val);
    const add = (left: number, right: number) => wasm.i32.add(left, right);
    const sub = (left: number, right: number) => wasm.i32.sub(left, right);
    const getmem = (ptr: number) => wasm.i32.load8_u(0, 1, ptr);

    this.wasm.addFunction("$compareStr", params(binaryen.i32, binaryen.i32), binaryen.i32,
      [binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32],
      wasm.block("", [
        // length1 = mem[ptr1]; length2 = mem[ptr2]
        setlocal(length1, getmem(getlocal(ptr1))),
        setlocal(length2, getmem(getlocal(ptr2))),

        // if (length1 === 0 || length2 === 0)
        wasm.if(
          wasm.i32.or(
            wasm.i32.eqz(getlocal(length1)),
            wasm.i32.eqz(getlocal(length2))
          ),
          // return length1 - length 2
          wasm.return(sub(getlocal(length1), getlocal(length2)))
        ),

        // end1 = ptr1 + length1; end2 = ptr2 + length2
        setlocal(end1, add(getlocal(ptr1), getlocal(length1))),
        setlocal(end2, add(getlocal(ptr2), getlocal(length2))),

        wasm.block("$compareStr.outer", [
          wasm.loop("$compareStr.loop", this.wasm.block("", [
            // ptr1++; ptr2++
            setlocal(ptr1, add(getlocal(ptr1), constant(1))),
            setlocal(ptr2, add(getlocal(ptr2), constant(1))),

            // c1 = mem[ptr1]; c2 = mem[ptr2];
            setlocal(c1, getmem(getlocal(ptr1))),
            setlocal(c2, getmem(getlocal(ptr2))),

            // if (c1 !== c2) break;
            wasm.br_if("$compareStr.outer",
              wasm.i32.ne(getlocal(c1), getlocal(c2))
            ),

            // if (end1 === ptr1 || end2 === ptr2)
            wasm.if(
              wasm.i32.or(
                wasm.i32.eq(getlocal(end1), getlocal(ptr1)),
                wasm.i32.eq(getlocal(end2), getlocal(ptr2)),
              ),
              // return length1 - length 2
              wasm.return(sub(getlocal(length1), getlocal(length2)))
            ),

            // loop back
            wasm.br("$compareStr.loop")
          ]))
        ]),

        // return c1 - c2
        wasm.return(sub(getlocal(c1), getlocal(c2)))
      ])
    );
  }

  /* Imports */

  putInt(operand: number, mode: number): number {
    this.importsUsed.add("rtl.$putint");
    return this.wasm.call("rtl.$putint", [operand, this.wasm.i32.const(mode)], binaryen.none);
  }

  putReal(operand: number): number {
    this.importsUsed.add("rtl.$putreal");
    return this.wasm.call("rtl.$putreal", [operand], binaryen.none);
  }

  putStr(addr: number): number {
    this.importsUsed.add("rtl.$putstr");
    return this.wasm.call("rtl.$putstr", [addr], binaryen.none);
  }

  putLn(): number {
    this.importsUsed.add("rtl.$putln");
    return this.wasm.call("rtl.$putln", [], binaryen.none);
  }

  readInt(): number {
    this.importsUsed.add("rtl.$readint");
    return this.wasm.call("rtl.$readint", [], binaryen.i32);
  }

  readChar(): number {
    this.importsUsed.add("rtl.$readchar");
    return this.wasm.call("rtl.$readchar", [], binaryen.i32);
  }

  readReal(): number {
    this.importsUsed.add("rtl.$readreal");
    return this.wasm.call("rtl.$readreal", [], binaryen.f64);
  }

  readStr(addr: number, maxSize: number): number {
    this.importsUsed.add("rtl.$readstr");
    return this.wasm.call("rtl.$readstr", [addr, this.wasm.i32.const(maxSize)], binaryen.none);
  }

  readLn(): number {
    this.importsUsed.add("rtl.$readln");
    return this.wasm.call("rtl.$readln", [], binaryen.none);
  }
}

function params(...types: number[]) {
  return binaryen.createType(types);
}
