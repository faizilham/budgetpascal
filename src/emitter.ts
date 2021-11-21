import binaryen, { MemorySegment } from "binaryen";
import { UnreachableErr } from "./errors";
import { BaseType, Expr, getTypeName, isBool, isString as isMemoryStored, MemoryStored, PascalType, StringType } from "./expression";
import { Program, Routine, Stmt, Subroutine, VariableEntry, VariableLevel } from "./routine";
import { Runtime, RuntimeBuilder } from "./runtime";
import { TokenTag } from "./scanner";

class Context {
  parent?: Context;
  routine: Routine;
  locals: number[];
  lastLocalIdx: number;

  constructor(routine: Routine, parent?: Context) {
    this.routine = routine;
    this.parent = parent;
    this.locals = [];
    this.lastLocalIdx = 0;
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
    const name = entry.name;
    if (entry.type === BaseType.Void) {
      if (entry.returnVar) return;
      throw new UnreachableErr(`Invalid variable type for ${entry.name}.`);
    }

    if (entry.temporary && entry.tempUsed < 1) {
      return;
    }

    const wasmType = this.getBinaryenType(entry.type);

    switch(entry.level) {
      case VariableLevel.GLOBAL: {
        const initValue = wasmType === binaryen.f64 ? this.wasm.f64.const(0) : this.wasm.i32.const(0);
        this.wasm.addGlobal(name, wasmType, true, initValue);
        break;
      }
      case VariableLevel.LOCAL: {
          const ctx = this.context();
          entry.index = ctx.lastLocalIdx++;

          if (!entry.paramVar) {
            ctx.locals.push(wasmType);
          }
        break;
      }
      default:
        throw new UnreachableErr(`Unknown variable scope level ${entry.level}.`); //TODO: upper variable
    }

    if (isMemoryStored(entry.type)) this.addMemoryStoredVar(entry, entry.type);
  }

  private addMemoryStoredVar(variable: VariableEntry, obj: MemoryStored) {
    let address = this.runtime.stackTop()

    if (variable.returnVar) {
      address = this.wasm.i32.sub(this.runtime.callframeStackTop(), this.wasm.i32.const(obj.bytesize));
    }

    if (variable.level === VariableLevel.GLOBAL) {
      this.currentBlock.push(
        this.wasm.global.set(variable.name, address)
      );
    } else {
      this.currentBlock.push(
        this.wasm.local.set(variable.index, address)
      );
    }

    if (!variable.returnVar) {
      this.currentBlock.push(
        this.runtime.pushStack(obj.bytesize)
      );
    }
  }

  private buildSubroutine(subroutine: Subroutine) {
    if (!subroutine.body) {
      throw new Error(`Panic: null subroutine body for ${subroutine.name}`);
    }

    this.startContext(subroutine);
    this.startBlock();

    const returnVar = subroutine.returnVar;

    if (isMemoryStored(returnVar.type)) {
      // return var should be outside of callframe
      this.currentBlock.push(this.runtime.pushStack(returnVar.type.bytesize));
    }

    // preserve stack using frame ptr
    this.currentBlock.push(this.runtime.pushFrame());

    this.buildDeclarations(subroutine);
    this.buildVariable(returnVar);

    const locals = this.context().locals;

    subroutine.body.accept(this);

    this.currentBlock.push(this.runtime.popFrame());

    const returnType = this.getBinaryenType(subroutine.returnVar.type);

    if (returnType !== binaryen.none) {
      this.currentBlock.push(
        this.wasm.local.get(returnVar.index, returnType)
      );
    }

    const body = this.endBlock("", false, returnType);

    let params = binaryen.none;
    const paramlist = subroutine.params.map((type) => this.getBinaryenType(type));
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
      case VariableLevel.GLOBAL: {
        instr = this.wasm.global.get(stmt.target.entry.name, binaryen.i32);
        instr = this.wasm.global.set(stmt.target.entry.name, increment(instr));
        break;
      }
      case VariableLevel.LOCAL: {
        instr = this.wasm.local.get(entry.index, binaryen.i32)
        instr = this.wasm.local.set(entry.index, increment(instr));
        break;
      }
      default:
        //TODO: upper variable
        throw new UnreachableErr(`Unknown variable scope level ${entry.level}.`);
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

  visitSetVariable(stmt: Stmt.SetVariable) {
    const entry = stmt.target.entry;
    let exprInstr = this.visitAndPreserveStack(stmt.value);
    // safe to do, since restoring stack top doesn't remove the value from memory

    if (stmt.target.type === BaseType.Real) {
      exprInstr = this.intoReal(stmt.value, exprInstr);
    } else if (isMemoryStored(stmt.target.type)) {
      return this.setStringVariable(stmt, exprInstr);
    }

    const instr = this.setVariable(entry, exprInstr);
    this.currentBlock.push(instr);
  }

  private setVariable(entry: VariableEntry, exprInstr: number): number {
    switch(entry.level) {
      case VariableLevel.GLOBAL: {
        return this.wasm.global.set(entry.name, exprInstr);
      }
      case VariableLevel.LOCAL: {
        return this.wasm.local.set(entry.index, exprInstr);
      }
      default:
        //TODO: upper variable
        throw new UnreachableErr(`Unknown variable scope level ${entry.level}.`);
    }
  }

  private setStringVariable(stmt: Stmt.SetVariable, sourceExpr: number) {
    const entry = stmt.target.entry;
    const strType = entry.type as StringType;
    let targetAddr;
    switch(entry.level) {
      case VariableLevel.GLOBAL: {
        targetAddr = this.wasm.global.get(stmt.target.entry.name, binaryen.i32);
        break;
      }
      case VariableLevel.LOCAL: {
        targetAddr = this.wasm.local.get(entry.index, binaryen.i32);
        break;
      }
      default:
        //TODO: upper variable
        throw new UnreachableErr(`Unknown variable scope level ${entry.level}.`);
    }

    const copyInstr = this.runtime.copyString(targetAddr, strType.size, sourceExpr);

    this.currentBlock.push(copyInstr);
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
    return this.wasm.call(subroutine.absoluteName, args, returnType);
  }

  visitVariable(expr: Expr.Variable): number {
    const entry = expr.entry;
    const wasmType = this.getBinaryenType(entry.type);

    switch(entry.level) {
      case VariableLevel.GLOBAL:
        return this.wasm.global.get(entry.name, wasmType)
      case VariableLevel.LOCAL: {
        return this.wasm.local.get(entry.index, wasmType);
      }
      default:
        //TODO: upper variable
        throw new UnreachableErr(`Unknown variable scope level ${entry.level}.`);
    }
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
    if (toType === BaseType.Real && fromType === BaseType.Integer) {
      return this.wasm.f64.convert_s.i32(operand);
    } else if (isMemoryStored(toType) && fromType === BaseType.Char) {
      return this.runtime.charToStr(operand);
    }

    // other typecasts should be between chars, int, and bool
    return operand;
  }


  visitLiteral(expr: Expr.Literal): number {
    if (isMemoryStored(expr.type)) {
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
