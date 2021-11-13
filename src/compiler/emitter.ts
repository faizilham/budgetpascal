import binaryen, { MemorySegment } from "binaryen";
import { UnreachableErr } from "./errors";
import { BaseType, Expr, getTypeName, isBool, isString, PascalType } from "./expression";
import { Decl, Program, Routine, Stmt, VariableLevel } from "./routine";
import { TokenTag } from "./scanner";

const PUTINT_MODE_INT = 0;
const PUTINT_MODE_CHAR = 1;
const PUTINT_MODE_BOOL = 2;

const DATA_ADDRESS = 0;

class Context {
  parent?: Context;
  routine: Routine;
  locals: number[];
  constructor(routine: Routine, parent?: Context) {
    this.routine = routine;
    this.parent = parent;
    this.locals = [];
  }
}

export class Emitter implements Expr.Visitor<number>, Stmt.Visitor<void>, Decl.Visitor<void> {
  private wasm: binaryen.Module;
  private currentBlock: number[];
  private prevBlocks: number[][];
  private currentContext?: Context;
  private currentLoop: number;
  private loopCount: number;
  private stringAddresses: number[];

  constructor(private program: Program) {
    this.wasm = new binaryen.Module();
    this.currentBlock = [];
    this.prevBlocks = [];
    this.currentLoop = 0;
    this.loopCount = 0;
    this.stringAddresses = [];
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

    this.startContext(this.program);
    this.buildMemory();
    this.buildDeclarations(this.program);
    this.program.body.accept(this);

    const body = this.currentBlock[0] as number;
    const locals = this.context().locals;
    const main = this.wasm.addFunction("main", binaryen.none, binaryen.none, locals, body);
    this.endContext();

    this.wasm.addFunctionExport("main", "main");

    this.addImports();

    if (!this.wasm.validate()) {
      console.error(this.wasm.emitText());
      throw new Error("Panic: invalid wasm");
    }

    if (optimize) this.wasm.optimize();
  }

  private addImports() {
    this.wasm.addFunctionImport("putint", "rtl", "putint",
      binaryen.createType([binaryen.i32, binaryen.i32]), binaryen.none);
    this.wasm.addFunctionImport("putreal", "rtl", "putreal", binaryen.f64, binaryen.none);
    this.wasm.addFunctionImport("putln", "rtl", "putln", binaryen.none, binaryen.none);
    this.wasm.addFunctionImport("putstr", "rtl", "putstr", binaryen.i32, binaryen.none);
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
    let offset = DATA_ADDRESS;

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

  private getStringLiteral(id: number): number {
    return this.stringAddresses[id];
  }

  /* Declarations */
  buildDeclarations(routine: Routine) {
    for (let decl of routine.declarations) {
      decl.accept(this);
    }
  }

  visitVariableDecl(variable: Decl.Variable) {
    const entry = variable.entry;
    const name = entry.name;
    let wasmType, initValue;
    switch(entry.type) {
      case BaseType.Boolean:
      case BaseType.Char:
      case BaseType.Integer:
        wasmType = binaryen.i32;
        initValue = this.wasm.i32.const(0);
      break;
      case BaseType.Real:
        wasmType = binaryen.f64;
        initValue = this.wasm.f64.const(0);
      break;
      default:
        throw new UnreachableErr(`Unknown variable type ${getTypeName(entry.type)}.`);
    }

    switch(entry.level) {
      case VariableLevel.GLOBAL: {
        this.wasm.addGlobal(name, wasmType, true, initValue);
        break;
      }
      case VariableLevel.LOCAL: {
          const locals = this.context().locals;
          entry.index = locals.length;
          locals.push(wasmType);
        break;
      }
      default:
        new UnreachableErr(`Unknown variable scope level ${entry.level}.`); //TODO: upper variable
    }
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

  /* Statements */
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

  private endBlock(blockname: string = "", isLoop = false): number {
    let block;
    if (isLoop) {
      block = this.wasm.loop(blockname, this.wasm.block("", this.currentBlock));
    } else {
      block = this.wasm.block(blockname, this.currentBlock);
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

    let condition = stmt.condition.accept(this);
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
    let condition = stmt.condition.accept(this);

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

  visitRepeatUntil(stmt: Stmt.RepeatUntil) {
    const prevLoop = this.currentLoop;
    this.currentLoop = this.addLoop();

    this.startBlock();
    const loopLabel = this.getLoopLabel();
    const outerLabel = this.getOuterLoopLabel();

    for (const s of stmt.statements) {
      s.accept(this);
    }

    const finishCondition = stmt.finishCondition.accept(this);
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
    let exprInstr = stmt.value.accept(this);

    if (stmt.target.type === BaseType.Real) {
      exprInstr = this.intoReal(stmt.value, exprInstr);
    }
    // TODO: handle string?

    let instr;

    switch(entry.level) {
      case VariableLevel.GLOBAL: {
        instr = this.wasm.global.set(stmt.target.entry.name, exprInstr);
        break;
      }
      case VariableLevel.LOCAL: {
        instr = this.wasm.local.set(entry.index, exprInstr);
        break;
      }
      default:
        //TODO: upper variable
        throw new UnreachableErr(`Unknown variable scope level ${entry.level}.`);
    }

    this.currentBlock.push(instr);
  }

  visitWhileDo(stmt: Stmt.WhileDo)  {
    const prevLoop = this.currentLoop;
    this.currentLoop = this.addLoop();

    this.startBlock();
    let condition = stmt.condition.accept(this);
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
      let params: number[] = [];

      params[0] = e.accept(this);

      let func = "putint";
      switch(e.type) {
        case BaseType.Real:
          func = "putreal";
        break;
        case BaseType.Integer:
          params.push(this.wasm.i32.const(PUTINT_MODE_INT));
        break;
        case BaseType.Char:
          params.push(this.wasm.i32.const(PUTINT_MODE_CHAR));
        break;
        case BaseType.Boolean:
          params.push(this.wasm.i32.const(PUTINT_MODE_BOOL));
        break;
        default: // assumed String type
          func = "putstr";
        break;
      }

      this.currentBlock.push(
        this.wasm.call(func, params, binaryen.none)
      );
    }

    if (stmt.newline) {
      this.currentBlock.push(
        this.wasm.call("putln", [], binaryen.none)
      );
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

  /* Expressions */

  visitVariable(expr: Expr.Variable): number {
    const entry = expr.entry;

    let wasmType;
    switch(expr.type) {
      case BaseType.Boolean:
      case BaseType.Char:
      case BaseType.Integer:
        wasmType = binaryen.i32;
      break;
      case BaseType.Real:
        wasmType = binaryen.f64;
      break;
      default:
        throw new UnreachableErr(`Unknown variable type ${getTypeName(expr.type)}.`);
    }

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

  visitLiteral(expr: Expr.Literal): number {
    if (isString(expr.type)) {
      return this.wasm.i32.const(this.getStringLiteral(expr.literal));
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
