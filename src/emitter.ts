import binaryen, { MemorySegment } from "binaryen";
import { UnreachableErr } from "./errors";
import { BaseType, Expr, getTypeName, isBool, isMemoryType, isOrdinal, isString, MemoryType, PascalType, StringType } from "./expression";
import { ParamType, Program, Routine, Stmt, Subroutine, VariableEntry, VariableLevel } from "./routine";
import { Runtime, RuntimeBuilder } from "./runtime";
import { TokenTag } from "./scanner";

class Context {
  parent?: Context;
  routine: Routine;
  locals: number[];
  lastLocalIdx: number;
  memoffset: number;

  constructor(routine: Routine, parent?: Context) {
    this.routine = routine;
    this.parent = parent;
    this.locals = [];
    this.lastLocalIdx = 0;
    this.memoffset = 0;
  }
}

export class Emitter implements Expr.Visitor<number>, Stmt.Visitor<void> {
  private wasm: binaryen.Module;
  private currentBlock: number[];
  private prevBlocks: number[][];
  private currentContext?: Context;
  private currentLoop: number;
  private loopCount: number;
  private labelCount: number;
  private stringAddresses: number[];
  private runtime: RuntimeBuilder;

  constructor(private program: Program) {
    this.wasm = new binaryen.Module();
    this.currentBlock = [];
    this.prevBlocks = [];
    this.currentLoop = 0;
    this.loopCount = 0;
    this.labelCount = 0;
    this.stringAddresses = [];
    this.runtime = new RuntimeBuilder(this.wasm);
  }

  emit(optimize: boolean = true): Uint8Array {
    this.buildProgram(optimize);
    return this.wasm.emitBinary();
  }

  private buildProgram(optimize: boolean) {
    // init module
    if (!this.program.body) {
      throw new Error("Panic: null program body");
    }

    // binaryen.setDebugInfo(true);

    this.buildMemory();
    this.runtime.buildStack();

    this.startContext(this.program);
    this.buildDeclarations(this.program);

    // this.debugPrintStackTop();
    this.program.body.accept(this);
    // this.debugPrintStackTop();

    const body = this.wasm.block("", this.currentBlock);
    const locals = this.context().locals;
    this.wasm.addFunction("$main", binaryen.none, binaryen.none, locals, body);
    this.endContext();

    this.wasm.addFunctionExport("$main", "main");

    this.runtime.buildImports();

    if (!this.wasm.validate()) {
      console.error("Dump:");
      console.error(this.wasm.emitText());
      throw new Error("Panic: invalid wasm");
    }

    // console.error(this.wasm.emitText());
    if (optimize) this.wasm.optimize();

  }

  private buildMemory() {
    const segments = this.buildStrings();
    this.wasm.setMemory(2, 64, "mem", segments); // 64 page = 4MB
  }

  private buildStrings(): MemorySegment[] {
    this.stringAddresses = [];
    const stringTable = this.program.stringTable;
    if (!stringTable) return [];

    let entries: [string, number][] = [];
    for (const entry of stringTable.entries()){
      entries.push(entry);
    }

    entries.sort((a, b) => a[1] - b[1]);

    const segments: MemorySegment[] = [];
    let offset = Runtime.DATA_ADDRESS;

    for (const [str, id] of entries) {
      const data = new Uint8Array(str.length + 1);
      data[0] = str.length;

      for (let i = 0; i < str.length; i++) {
        data[i+1] = str.charCodeAt(i);
      }

      segments.push({data, offset: this.wasm.i32.const(offset)});
      this.stringAddresses.push(offset);
      offset += data.length;
    }

    return segments;
  }

  private getStringAddress(id: number): number {
    return this.stringAddresses[id];
  }

  private debugPrintStackTop() {
    this.currentBlock.push(this.runtime.debugPrintStackTop());
  }

  /* Declarations */
  private buildDeclarations(routine: Routine) {
    for (const variable of routine.identifiers.variables) {
      this.buildVariable(variable);
    }

    for (const subroutine of routine.identifiers.subroutines) {
      this.buildSubroutine(subroutine);
    }
  }

  private buildVariable(entry: VariableEntry) {
    if (entry.type === BaseType.Void) {
      if (entry.returnVar) return;
      throw new UnreachableErr(`Invalid variable type for ${entry.name}.`);
    }

    if (entry.temporary && entry.usedCount < 1) {
      return;
    }

    let wasmType = this.getBinaryenType(entry.type);
    if (entry.paramVar && entry.paramType === ParamType.REF) {
      wasmType = binaryen.i32;
    }

    switch(entry.level) {
      case VariableLevel.UPPER: return this.addUpperVar(entry, wasmType);
      case VariableLevel.LOCAL: {
          const ctx = this.context();
          entry.index = ctx.lastLocalIdx++;

          if (!entry.paramVar) {
            ctx.locals.push(wasmType);
          }
        break;
      }
    }

    if (isMemoryType(entry.type)) {
      this.addMemoryStoredVar(entry, entry.type);
    }
  }

  private addUpperVar(variable: VariableEntry, wasmType: number) {
    const ctx = this.context();
    variable.index = ctx.lastLocalIdx++;

    if (!variable.paramVar) {
      ctx.locals.push(wasmType);
    }

    if (variable.paramType !== ParamType.REF && isMemoryType(variable.type)) {
      return this.addMemoryStoredVar(variable, variable.type);
    }

    const size = wasmType === binaryen.f64 ? 8 : 4;
    const value = this.wasm.local.get(variable.index, wasmType);

    if (variable.paramVar) {
      // store argument to memory
      const address = this.runtime.stackTop();

      let init;
      if (wasmType === binaryen.f64) {
        init = this.wasm.f64.store(0, 1, address, value);
      } else {
        init = this.wasm.i32.store(0, 1, address, value);
      }
      this.currentBlock.push(init);
    }

    this.updateOffset(variable, size);

    this.currentBlock.push(
      this.runtime.pushStack(size)
    );
  }

  private addNewLocalVar(wasmType: number): number {
    const context = this.context();
    const id = context.lastLocalIdx++;
    context.locals.push(wasmType);
    return id;
  }

  private addMemoryStoredVar(variable: VariableEntry, obj: MemoryType) {
    let address = this.runtime.stackTop()

    if (variable.returnVar) {
      address = this.wasm.i32.sub(this.runtime.callframeStackTop(), this.wasm.i32.const(obj.bytesize));
      this.currentBlock.push(this.wasm.local.set(variable.index, address));
      return;
    }

    if (variable.paramVar) {
      if (variable.paramType === ParamType.CONST && variable.level === VariableLevel.LOCAL) {
        // optimization: no need to memcopy const var if it's used locally
        return;
      } else if (variable.paramType === ParamType.REF) {
        // refParam is just a pointer
        return;
      }

      const paramValue = this.wasm.local.get(variable.index, binaryen.i32);
      // copy memory
      if (isString(obj as PascalType)) {
        const str = obj as StringType;
        this.currentBlock.push(
          this.runtime.copyString(this.runtime.stackTop(), str.size, paramValue)
        );
      } else {
        this.currentBlock.push(
          this.wasm.memory.copy(this.runtime.stackTop(), paramValue, obj.bytesize)
        );
      }
    }

    // set address
    this.currentBlock.push(this.wasm.local.set(variable.index, address));

    this.updateOffset(variable, obj.bytesize);
    this.currentBlock.push(
      this.runtime.pushStack(obj.bytesize)
    );
  }

  private updateOffset(variable: VariableEntry, size: number) {
    const ctx = this.context();

    variable.memsize = size;
    variable.memoffset = ctx.memoffset;

    ctx.memoffset += size;
  }

  private buildSubroutine(subroutine: Subroutine) {
    if (!subroutine.body) {
      throw new Error(`Panic: null subroutine body for ${subroutine.name}`);
    }

    this.startContext(subroutine);
    this.startBlock();

    const returnVar = subroutine.returnVar;
    const isFunction = returnVar.type !== BaseType.Void

    if (isMemoryType(returnVar.type)) {
      // return var should be outside of callframe
      this.currentBlock.push(this.runtime.pushStack(returnVar.type.bytesize));
    }

    // preserve stack using frame ptr
    this.currentBlock.push(this.runtime.pushFrame(subroutine.id));

    this.buildDeclarations(subroutine);
    this.buildVariable(returnVar);

    const locals = this.context().locals;

    subroutine.body.accept(this);

    const returnType = this.getBinaryenType(returnVar.type);
    this.currentBlock.push(this.runtime.popFrame());

    if (isFunction) {
      this.currentBlock.push(
        this.wasm.local.get(returnVar.index, returnType)
      );
    }

    const body = this.endBlock("", false, returnType);

    let params = binaryen.none;
    const paramlist = subroutine.params.map((param) => this.getBinaryenType(param.type));
    if (paramlist.length > 0) {
      params = binaryen.createType(paramlist);
    }

    this.wasm.addFunction(subroutine.absoluteName, params, returnType, locals, body);
    this.endContext();
  }

  private startContext(routine: Routine) {
    const context = new Context(routine, this.currentContext);
    this.currentContext = context;
  }

  private endContext() {
    this.currentContext = this.context().parent;
  }

  private context(): Context {
    return this.currentContext as Context;
  }

  private getBinaryenType(type: PascalType) {
    switch(type) {
      case BaseType.Real: return binaryen.f64;
      case BaseType.Void: return binaryen.none;
      default:
        // int, char, boolean, and pointers are all i32
        return binaryen.i32;
    }
  }

  private isLocallyUsed(variable: VariableEntry): boolean {
    return variable.ownerId === this.context().routine.id;
  }

  private resolveUpperVariable(variable: VariableEntry): number {
    let base;
    if (variable.ownerId === 0) {
      base = this.runtime.stackBase();
    } else if (this.isLocallyUsed(variable)) {
      base = this.runtime.callframeStackTop();
    } else {
      base = this.runtime.lastCallframeById(variable.ownerId);
    }

    if (variable.memoffset === 0) return base;

    return this.wasm.i32.add(base, this.wasm.i32.const(variable.memoffset));
  }

  /* Statements */
  visitCallStmt(stmt: Stmt.CallStmt): void {
    let exprInstr = stmt.callExpr.accept(this);

    if (stmt.callExpr.type !== BaseType.Void) {
      exprInstr = this.wasm.drop(exprInstr);
    }

    if (stmt.callExpr.stackNeutral) {
      this.currentBlock.push(exprInstr);
    } else {
      this.currentBlock.push(
        this.wasm.local.set(stmt.tempVar.index, this.runtime.stackTop()),
        exprInstr,
        this.runtime.restoreStackTop(this.wasm.local.get(stmt.tempVar.index, binaryen.i32))
      );
    }
  }

  visitCompound(stmt: Stmt.Compound) {
    this.startBlock();

    this.flattenCompound(this.currentBlock, stmt);
    const block = this.endBlock();
    this.currentBlock.push(block);
  }

  private startBlock() {
    this.prevBlocks.push(this.currentBlock);
    this.currentBlock = [];
  }

  private endBlock(blockname: string = "", isLoop = false, returnType: number = binaryen.none): number {
    let block;
    if (isLoop) {
      block = this.wasm.loop(blockname, this.wasm.block("", this.currentBlock));
    } else {
      block = this.wasm.block(blockname, this.currentBlock, returnType);
    }
    const prev = this.prevBlocks.pop();

    if (!prev) throw new Error("No previous block to return to");

    this.currentBlock = prev;
    return block;
  }

  private flattenCompound(children: number[], stmt: Stmt.Compound) {
    for (let s of stmt.statements) {
      if (s instanceof Stmt.Compound) {
        this.flattenCompound(children, s);
      } else {
        s.accept(this);
      }
    }
  }

  visitForLoop(stmt: Stmt.ForLoop) {
    const prevLoop = this.currentLoop;
    this.currentLoop = this.addLoop();

    this.startBlock(); // start outer block

    for (const s of stmt.initializations){
      s.accept(this);
    }

    this.startBlock();// start loop block

    let condition = this.visitAndPreserveStack(stmt.condition);
    const loopLabel = this.getLoopLabel();
    const outerLabel = this.getOuterLoopLabel();

    // increment first
    stmt.increment.accept(this);

    // then check conditions
    this.currentBlock.push(
      this.wasm.br_if(outerLabel, this.wasm.i32.eqz(condition))
    );

    stmt.body.accept(this);

    this.currentBlock.push(
      this.wasm.br(loopLabel)
    );

    const loopblock = this.endBlock(loopLabel, true); // end of loop block
    this.currentBlock.push(loopblock);

    const outerblock = this.endBlock(outerLabel); //end of outer block
    this.currentBlock.push(outerblock);

    this.currentLoop = prevLoop;
  }

  visitIfElse(stmt: Stmt.IfElse) {
    let condition = this.visitAndPreserveStack(stmt.condition);

    let ifTrue, ifFalse;

    if (stmt.body) {
      this.startBlock();
      stmt.body.accept(this);
      ifTrue = this.endBlock();

      if (stmt.elseBody) {
        this.startBlock();
        stmt.elseBody.accept(this);
        ifFalse = this.endBlock();
      }
    } else {
      if (!stmt.elseBody) throw new UnreachableErr("If-Else with empty body in both cases");

      condition = this.wasm.i32.eqz(condition);
      this.startBlock();
      stmt.elseBody.accept(this);
      ifTrue = this.endBlock();
    }

    this.currentBlock.push(
      this.wasm.if(condition, ifTrue, ifFalse)
    );
  }

  visitIncrement(stmt: Stmt.Increment): void {
    const entry = stmt.target.entry;

    const increment = (left: number) => (
      stmt.ascending ?
      this.wasm.i32.add(left, this.wasm.i32.const(1)) :
      this.wasm.i32.sub(left, this.wasm.i32.const(1))
    )

    let instr;
    switch(entry.level) {
      case VariableLevel.LOCAL: {
        instr = this.wasm.local.get(entry.index, binaryen.i32)
        instr = this.wasm.local.set(entry.index, increment(instr));
        break;
      }
      case VariableLevel.UPPER: {
        // should be upper but from "global" level variable (i.e. ownerId == 0)
        instr = this.getVariableValue(entry);
        instr = this.setVariable(entry, increment(instr));
        break;
      }
    }

    this.currentBlock.push(instr);
  }

  visitLoopControl(stmt: Stmt.LoopControl) {
    let instr;
    if (stmt.token.tag === TokenTag.BREAK) {
      instr = this.wasm.br(this.getOuterLoopLabel());
    } else { // TokenTag.CONTINUE
      instr = this.wasm.br(this.getLoopLabel());
    }
    this.currentBlock.push(instr);
  }

  visitRead(stmt: Stmt.Read): void {
    // TODO: handle array & record member
    // TODO: handle refvariable
    for (let target of stmt.targets) {
      const entry = target.entry;

      let call;
      switch(entry.type) {
        case BaseType.Real:
          call = this.setVariable(entry, this.runtime.readReal());
        break;
        case BaseType.Integer:
          call = this.setVariable(entry, this.runtime.readInt());
        break;
        case BaseType.Char:
          call = this.setVariable(entry, this.runtime.readChar());
        break;
        default: // assumed String type
        {
          const type = entry.type as StringType;
          const addr = this.visitVariable(target);
          call = this.runtime.readStr(addr, type.size);
          break;
        }
      }

      this.currentBlock.push(call);
    }

    if (stmt.newline) {
      this.currentBlock.push(this.runtime.readLn());
    }
  }

  visitRepeatUntil(stmt: Stmt.RepeatUntil) {
    const prevLoop = this.currentLoop;
    this.currentLoop = this.addLoop();

    this.startBlock();
    const loopLabel = this.getLoopLabel();
    const outerLabel = this.getOuterLoopLabel();

    for (const s of stmt.statements) {
      s.accept(this);
    }

    const finishCondition = this.visitAndPreserveStack(stmt.finishCondition);
    this.currentBlock.push(
      this.wasm.br_if(outerLabel, finishCondition)
    );

    this.currentBlock.push(
      this.wasm.br(loopLabel)
    );

    const loopblock = this.endBlock(loopLabel, true);
    const outerblock = this.wasm.block(outerLabel, [loopblock]);
    this.currentBlock.push(outerblock);
    this.currentLoop = prevLoop;
  }

  visitSetString(stmt: Stmt.SetString) {
    let sourceExpr = this.visitAndPreserveStack(stmt.value);
    let targetAddr = this.visitAndPreserveStack(stmt.target);

    const strType = stmt.target.type as StringType;

    this.currentBlock.push(
      this.runtime.copyString(targetAddr, strType.size, sourceExpr)
    );
  }

  visitSetVariable(stmt: Stmt.SetVariable) {
    const entry = stmt.target.entry;
    let exprInstr = this.visitAndPreserveStack(stmt.value);
    // safe to do, since restoring stack top doesn't remove the value from memory

    const instr = this.assignVariable(entry, exprInstr);
    this.currentBlock.push(instr);
  }

  private assignVariable(entry: VariableEntry, exprInstr: number): number {
    if (entry.type === BaseType.Real && binaryen.getExpressionType(exprInstr) === binaryen.i32) {
      exprInstr = this.wasm.f64.convert_s.i32(exprInstr);
    }

    return this.setVariable(entry, exprInstr);
  }

  private setVariable(entry: VariableEntry, exprInstr: number): number {
    switch(entry.level) {
      case VariableLevel.LOCAL: {
        return this.wasm.local.set(entry.index, exprInstr);
      }
      case VariableLevel.UPPER: {
        const address = this.resolveUpperVariable(entry);

        if (entry.type === BaseType.Real) {
          return this.wasm.f64.store(0, 1, address, exprInstr);
        } else {
          return this.wasm.i32.store(0, 1, address, exprInstr);
        }
      }
    }
  }

  visitSetRefVariable(stmt: Stmt.SetRefVariable) {
    let exprInstr = this.visitAndPreserveStack(stmt.value);
    const address = this.getReferredAddress(stmt.target);

    const type = stmt.target.type;

    let instr;
    if (isString(type)) {
      instr = this.runtime.copyString(address, type.size, exprInstr);
    } else if (type === BaseType.Real) {
      // TODO: array & records

      instr = this.wasm.f64.store(0, 1, address, exprInstr);
    } else {
      instr = this.wasm.i32.store(0, 1, address, exprInstr);
    }

    this.currentBlock.push(instr);
  }

  visitWhileDo(stmt: Stmt.WhileDo)  {
    const prevLoop = this.currentLoop;
    this.currentLoop = this.addLoop();

    this.startBlock();
    let condition = this.visitAndPreserveStack(stmt.condition);
    const loopLabel = this.getLoopLabel();
    const outerLabel = this.getOuterLoopLabel();

    this.currentBlock.push(
      this.wasm.br_if(outerLabel, this.wasm.i32.eqz(condition))
    );

    stmt.body.accept(this);

    this.currentBlock.push(
      this.wasm.br(loopLabel)
    );

    const loopblock = this.endBlock(loopLabel, true);
    const outerblock = this.wasm.block(outerLabel, [loopblock]);
    this.currentBlock.push(outerblock);

    this.currentLoop = prevLoop;
  }

  visitWrite(stmt: Stmt.Write) {
    for (let e of stmt.outputs) {
      const operand = this.visitAndPreserveStack(e);

      let call;
      switch(e.type) {
        case BaseType.Real:
          call = this.runtime.putReal(operand);
        break;
        case BaseType.Integer:
          call = this.runtime.putInt(operand, Runtime.PUTINT_MODE_INT);
        break;
        case BaseType.Char:
          call = this.runtime.putInt(operand, Runtime.PUTINT_MODE_CHAR);
        break;
        case BaseType.Boolean:
          call = this.runtime.putInt(operand, Runtime.PUTINT_MODE_BOOL);
        break;
        default: // assumed String type
          call = this.runtime.putStr(operand);
        break;
      }

      this.currentBlock.push(call);
    }

    if (stmt.newline) {
      this.currentBlock.push(this.runtime.putLn());
    }
  }

  private addLoop() {
    return this.loopCount++;
  }

  private getLoopLabel() {
    return "L" + this.currentLoop;
  }

  private getOuterLoopLabel() {
    return "OL" + this.currentLoop;
  }

  private addNewLabel() {
    // custom non loop labels
    return "LB" + (this.labelCount++);
  }

  /* Expressions */
  visitAndPreserveStack(expr: Expr): number {
    let exprInstr = expr.accept(this);
    if (!expr.stackNeutral) {
      exprInstr = this.runtime.preserveStack(exprInstr);
    }

    return exprInstr;
  }

  visitCall(expr: Expr.Call): number {
    const subroutine = expr.callee;
    const returnType = this.getBinaryenType(subroutine.returnVar.type);
    const args = expr.args.map((arg) => arg.accept(this));

    let callInstr = this.wasm.call(subroutine.absoluteName, args, returnType);
    return callInstr;
  }

  visitVariable(expr: Expr.Variable): number {
    const entry = expr.entry;
    return this.getVariableValue(entry);
  }

  getVariableValue(entry: VariableEntry): number {
    const wasmType = this.getBinaryenType(entry.type);

    switch(entry.level) {
      case VariableLevel.LOCAL: {
        return this.wasm.local.get(entry.index, wasmType);
      }
      case VariableLevel.UPPER: {
        const address = this.resolveUpperVariable(entry);

        if (isMemoryType(entry.type)) return address;
        if (wasmType === binaryen.f64) {
          return this.wasm.f64.load(0, 1, address);
        } else {
          return this.wasm.i32.load(0, 1, address);
        }
      }
    }
  }

  visitRefer(expr: Expr.Refer): number {
    // TODO: array / record member;
    const entry = expr.source.entry;
    if (entry.level !== VariableLevel.UPPER) {
      throw new UnreachableErr("Trying to refer non-upper variable");
    }

    const address = this.resolveUpperVariable(entry);
    return address;
  }

  visitRefVariable(expr: Expr.RefVariable): number {
    // assumption: refvariable entry will be set to i32
    const entry = expr.entry;
    let address = this.getReferredAddress(expr);

    if (isMemoryType(entry.type)) {
      return address;
    }

    if (entry.type === BaseType.Real) {
      return this.wasm.f64.load(0, 1, address);
    }

    return this.wasm.i32.load(0, 1, address);
  }

  private getReferredAddress(expr: Expr.RefVariable): number {
    const entry = expr.entry;
    let address;

    if (entry.level === VariableLevel.LOCAL) {
      address = this.wasm.local.get(entry.index, binaryen.i32);
    } else { // VariableLevel.UPPER
      const entryAddress = this.resolveUpperVariable(entry);
      address = this.wasm.i32.load(0, 1, entryAddress);
    }

    return address;
  }

  visitUnary(expr: Expr.Unary): number {
    const operand = expr.operand.accept(this);

    switch(expr.operator.tag) {
      case TokenTag.NOT:
        if (isBool(expr.type)) {
          return this.wasm.i32.eqz(operand);
        } else {
          return this.wasm.i32.xor(operand, this.wasm.i32.const(0xFFFFFFFF));
        }

      case TokenTag.MINUS:
        if (expr.type === BaseType.Integer) {
          return this.wasm.i32.sub(this.wasm.i32.const(0), operand);
        }

      // TokenTag.Plus should already eliminated by parser

      default:
        throw new UnreachableErr(`Invalid unary operator ${expr.operator.lexeme}`);
    }
  }

  visitBinary(expr: Expr.Binary): number {
    const left = expr.a.accept(this);
    const right = expr.b.accept(this);

    switch(expr.operator.tag) {
      /* Arithmetic Operators */
      case TokenTag.PLUS: {
        if (expr.type === BaseType.Real) {
          return this.wasm.f64.add(
            this.intoReal(expr.a, left),
            this.intoReal(expr.b, right)
          );
        } else {
          return this.wasm.i32.add(left, right);
        }
      }

      case TokenTag.MINUS: {
        if (expr.type === BaseType.Real) {
          return this.wasm.f64.sub(
            this.intoReal(expr.a, left),
            this.intoReal(expr.b, right)
          );
        } else {
          return this.wasm.i32.sub(left, right);
        }
      }

      case TokenTag.MULTIPLY: {
        if (expr.type === BaseType.Real) {
          return this.wasm.f64.mul(
            this.intoReal(expr.a, left),
            this.intoReal(expr.b, right)
          );
        } else {
          return this.wasm.i32.mul(left, right);
        }
      }

      case TokenTag.SLASH: {
        return this.wasm.f64.div(
          this.intoReal(expr.a, left),
          this.intoReal(expr.b, right)
        );
      }

      case TokenTag.DIV: return this.wasm.i32.div_s(left, right);
      case TokenTag.MOD: return this.wasm.i32.rem_s(left, right);

      /* Bitwise and Logic */
      case TokenTag.AND: return this.wasm.i32.and(left, right);
      case TokenTag.OR : return this.wasm.i32.or(left, right);
      case TokenTag.XOR: return this.wasm.i32.xor(left, right);
      case TokenTag.SHL: return this.wasm.i32.shl(left, right);
      case TokenTag.SHR: return this.wasm.i32.shr_s(left, right);

      /* Comparison */

      case TokenTag.EQUAL: {
        const [type, a, b] = this.prepareComparator(expr.a, left, expr.b, right);
        if (type === BaseType.Real) {
          return this.wasm.f64.eq(a, b);
        } else {
          return this.wasm.i32.eq(a, b);
        }
      }
      case TokenTag.GREATER: {
        const [type, a, b] = this.prepareComparator(expr.a, left, expr.b, right);
        if (type === BaseType.Real) {
          return this.wasm.f64.gt(a, b);
        } else {
          return this.wasm.i32.gt_s(a, b);
        }
      }
      case TokenTag.LESS: {
        const [type, a, b] = this.prepareComparator(expr.a, left, expr.b, right);
        if (type === BaseType.Real) {
          return this.wasm.f64.lt(a, b);
        } else {
          return this.wasm.i32.lt_s(a, b);
        }
      }
      case TokenTag.GREATER_EQ: {
        const [type, a, b] = this.prepareComparator(expr.a, left, expr.b, right);
        if (type === BaseType.Real) {
          return this.wasm.f64.ge(a, b);
        } else {
          return this.wasm.i32.ge_s(a, b);
        }
      }
      case TokenTag.LESS_EQ: {
        const [type, a, b] = this.prepareComparator(expr.a, left, expr.b, right);
        if (type === BaseType.Real) {
          return this.wasm.f64.le(a, b);
        } else {
          return this.wasm.i32.le_s(a, b);
        }
      }
      case TokenTag.NOT_EQ: {
        const [type, a, b] = this.prepareComparator(expr.a, left, expr.b, right);
        if (type === BaseType.Real) {
          return this.wasm.f64.ne(a, b);
        } else {
          return this.wasm.i32.ne(a, b);
        }
      }

      default:
        throw new UnreachableErr(`Invalid binary operator ${expr.operator.lexeme}`);
    }
  }

  private prepareComparator(exprA: Expr, instrA: number, exprB: Expr, instrB: number):
    [BaseType, number, number] {

    if (isBool(exprA.type) || exprA.type === BaseType.Char) {
      return [BaseType.Integer, instrA, instrB];
    }

    if (exprA.type === BaseType.Integer && exprB.type === BaseType.Integer) {
      return [BaseType.Integer, instrA, instrB];
    }

    return [BaseType.Real, this.intoReal(exprA, instrA), this.intoReal(exprB, instrB)];
  }

  private intoReal(expr: Expr, instr: number): number {
    if (expr.type === BaseType.Real) return instr;
    return this.wasm.f64.convert_s.i32(instr);
  }

  visitShortCircuit(expr: Expr.ShortCircuit): number {
    const left = expr.a.accept(this);
    const right = expr.b.accept(this);

    let ifTrue, ifFalse

    if (expr.operator.tag === TokenTag.AND) {
      ifTrue = right;
      ifFalse = this.wasm.i32.const(0);
    } else { // TokenTag.OR
      ifTrue = this.wasm.i32.const(1);
      ifFalse = right;
    }

    return this.wasm.if(left, ifTrue, ifFalse);
  }

  visitStringConcat(expr: Expr.StringConcat): number {
    const ptrVar = expr.ptrVar.index;
    const strType = expr.type as StringType;
    const blockLabel = this.addNewLabel();

    const blockBody: number[] = [
      // ptrVar = sp
      this.wasm.local.set(ptrVar, this.runtime.stackTop()),

      // sp += str.size + 1
      this.runtime.pushStack(strType.size + 1),

      // mem[ptrVar] = 0
      this.wasm.i32.store8(0, 1, this.wasm.local.get(ptrVar, binaryen.i32), this.wasm.i32.const(0)),
    ];

    for (const operand of expr.operands) {
      const op = operand.accept(this);

      blockBody.push(
        this.runtime.appendString(this.wasm.local.get(ptrVar, binaryen.i32), strType.size, op)
      );
    }

    blockBody.push(
      this.wasm.br(blockLabel, undefined, this.wasm.local.get(ptrVar, binaryen.i32))
    );

    return this.wasm.block(blockLabel, blockBody, binaryen.i32);
  }

  visitStringCompare(expr: Expr.StringCompare): number {
    const left = expr.left.accept(this);
    const right = expr.right.accept(this);
    const compare = this.runtime.compareStr(left, right);

    switch(expr.operator.tag) {
      case TokenTag.EQUAL:
        return this.wasm.i32.eqz(compare);
      case TokenTag.NOT_EQ:
        return this.wasm.i32.ne(compare, this.wasm.i32.const(0));

      case TokenTag.GREATER:
        return this.wasm.i32.gt_s(compare, this.wasm.i32.const(0));
      case TokenTag.LESS:
        return this.wasm.i32.lt_s(compare, this.wasm.i32.const(0));

      case TokenTag.GREATER_EQ:
        return this.wasm.i32.ge_s(compare, this.wasm.i32.const(0));
      case TokenTag.LESS_EQ:
        return this.wasm.i32.le_s(compare, this.wasm.i32.const(0));

      default:
        throw new UnreachableErr(`Unknown string comparator ${expr.operator.lexeme}`);
    }
  }

  visitTypecast(expr: Expr.Typecast): number {
    const operand = expr.operand.accept(this);
    const fromType = expr.operand.type;
    const toType = expr.type;
    if (toType === BaseType.Real && isOrdinal(fromType)) {
      return this.wasm.f64.convert_s.i32(operand);
    } else if (isString(toType) && fromType === BaseType.Char) {
      return this.runtime.charToStr(operand);
    } else if (toType === BaseType.Boolean) {
      // make sure boolean value always 0 or 1
      return this.wasm.i32.ne(operand, this.wasm.i32.const(0));
    }

    // other typecasts should be between chars, int, and bool
    return operand;
  }


  visitLiteral(expr: Expr.Literal): number {
    if (isString(expr.type)) {
      return this.wasm.i32.const(this.getStringAddress(expr.literal));
    }

    switch(expr.type) {
      case BaseType.Integer:
      case BaseType.Char:
      case BaseType.Boolean:
        return this.wasm.i32.const(expr.literal);
      case BaseType.Real:
        return this.wasm.f64.const(expr.literal);
      default:
        throw new UnreachableErr("Invalid literal type " + getTypeName(expr.type));
    }
  }
}
