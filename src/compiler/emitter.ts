import binaryen, { UnreachableId } from "binaryen";
import { UnreachableErr } from "./errors";
import { BaseType, Expr, getTypeName, isBool } from "./expression";
import { Decl, Program, Routine, Stmt } from "./routine";
import { TokenTag } from "./scanner";

const PUTINT_MODE_INT = 0;
const PUTINT_MODE_CHAR = 1;
const PUTINT_MODE_BOOL = 2;

export class Emitter implements Expr.Visitor<number>, Stmt.Visitor<void>, Decl.Visitor<void> {
  public wasm: binaryen.Module;
  public currentBlock: number[];

  constructor(public program: Program) {
    this.wasm = new binaryen.Module();
    this.currentBlock = [];
  }

  emit(optimize: boolean = true): Uint8Array {
    this.buildProgram(optimize);
    return this.wasm.emitBinary();
  }

  buildProgram(optimize: boolean) {
    // init module
    if (!this.program.body) {
      throw new Error("Panic: null program body");
    }

    this.addImports();

    this.buildDeclarations(this.program);
    this.program.body.accept(this);
    const body = this.currentBlock[0] as number;

    const main = this.wasm.addFunction("main", binaryen.none, binaryen.none, [], body);
    this.wasm.addFunctionExport("main", "main");
    this.wasm.setStart(main);

    // console.log(this.wasm.emitText());

    if (optimize) this.wasm.optimize();
    if (!this.wasm.validate()) {
      throw new Error("Panic: invalid wasm");
    }
  }

  private addImports() {
    this.wasm.addFunctionImport("putint", "rtl", "putint",
      binaryen.createType([binaryen.i32, binaryen.i32]), binaryen.none);
    this.wasm.addFunctionImport("putreal", "rtl", "putreal", binaryen.f64, binaryen.none);
    this.wasm.addFunctionImport("putln", "rtl", "putln", binaryen.none, binaryen.none);
  }

  /* Declarations */
  buildDeclarations(routine: Routine) {
    for (let decl of routine.declarations) {
      decl.accept(this);
    }
  }

  visitVariableDecl(variable: Decl.Variable) {
    const name = variable.entry.name;
    let wasmType, initValue;
    switch(variable.entry.type) {
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
        throw new UnreachableErr(`Unknown variable type ${getTypeName(variable.entry.type)}.`);
    }

    this.wasm.addGlobal(name, wasmType, true, initValue);
  }

  /* Statements */
  visitCompound(stmt: Stmt.Compound) {
    let prevBlock = this.currentBlock;
    this.currentBlock = [];

    this.flattenCompound(this.currentBlock, stmt);
    const block = this.wasm.block("", this.currentBlock);
    this.currentBlock = prevBlock;
    prevBlock.push(block);
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

  visitSetGlobalVar(stmt: Stmt.SetGlobalVar): void {
    let exprInstr = stmt.value.accept(this);


    if (stmt.target.type === BaseType.Real) {
      exprInstr = this.intoReal(stmt.value, exprInstr);
    }
    // TODO: handle string?

    this.currentBlock.push(
      this.wasm.global.set(stmt.target.name.lexeme, exprInstr)
    );
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
        default: continue;
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

  /* Expressions */

  visitGlobalVar(expr: Expr.GlobalVar): number {
    const name = expr.name.lexeme;

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

    return this.wasm.global.get(name, wasmType)
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

      case TokenTag.DIV:
        return this.wasm.i32.div_s(left, right);

      case TokenTag.MOD:
        return this.wasm.i32.rem_s(left, right);

      /* Bitwise and Logic */
      case TokenTag.XOR:
        return this.wasm.i32.xor(left, right);

      case TokenTag.SHL:
        return this.wasm.i32.shl(left, right);

      case TokenTag.SHR:
        return this.wasm.i32.shr_s(left, right);

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

  visitLiteral(expr: Expr.Literal): number {
    switch(expr.type) {
      case BaseType.Integer:
      case BaseType.Char:
        return this.wasm.i32.const(expr.literal as number);
      case BaseType.Boolean:
        return this.wasm.i32.const(expr.literal ? 1 : 0);
      case BaseType.Real:
        return this.wasm.f64.const(expr.literal as number);
      default:
        throw new UnreachableErr("Invalid literal type " + getTypeName(expr.type));
    }
  }
}
