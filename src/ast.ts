import { UnreachableErr } from "./errors";
import { Subroutine, VariableEntry } from "./routine";
import { LibraryFunction } from "./runtime";
import { Token } from "./scanner";
import { ARRAY_HEADER_SIZE, BaseType, FileType, getTypeName, isArrayType, isBaseType, isPointer, isString, PascalType, Pointer, sizeOf, StringType } from "./types";

export abstract class Expr {
  assignable: boolean = false;
  type: PascalType | undefined;
  stackNeutral: boolean = false;
  public abstract accept<T>(visitor: Expr.Visitor<T>) : T;
}

export namespace Expr {
  export class Call extends Expr {
    constructor(public callee: Subroutine, public args: Expr[]){
      super();
      this.type = callee.returnVar.type;
      let stackNeutral = isBaseType(this.type);
      if (stackNeutral) {
        for (const arg of args) {
          if (!arg.stackNeutral) {
            stackNeutral = false;
            break;
          }
        }
      }

      this.stackNeutral = stackNeutral;
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitCall(this);
    }
  }

  export class CallLib extends Expr {
    constructor(public callee: LibraryFunction, public args: Expr[]) {
      super();
      this.type = callee.returnType;
      let stackNeutral = isBaseType(this.type);
      if (stackNeutral) {
        for (const arg of args) {
          if (!arg.stackNeutral) {
            stackNeutral = false;
            break;
          }
        }
      }

      this.stackNeutral = stackNeutral;
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitCallLib(this);
    }
  }

  export class Unary extends Expr {
    constructor(public operator: Token, public operand: Expr){
      super();
      this.stackNeutral = operand.stackNeutral;
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitUnary(this);
    }
  }

  export class Binary extends Expr {
    constructor(public operator: Token, public a: Expr, public b: Expr){
      super();
      this.stackNeutral = a.stackNeutral && b.stackNeutral;
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitBinary(this);
    }
  }

  export class Field extends Expr {
    constructor(public operand: Expr, public fieldOffset: number, public fieldType: PascalType) {
      super();
      this.assignable = operand.assignable;
      this.stackNeutral = operand.stackNeutral;
      this.type = new Pointer(fieldType);
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitField(this);
    }
  }

  export class Indexer extends Expr {
    startIndex: number
    elementSize: number;
    headerOffset: number
    constructor(public operand: Expr, public index: Expr) {
      super();
      this.stackNeutral = operand.stackNeutral && index.stackNeutral;
      this.assignable = operand.assignable;

      const operandType = operand.type;

      if (isString(operandType)) {
        this.startIndex = 1;
        this.elementSize = sizeOf(BaseType.Char);
        this.type = new Pointer(BaseType.Char);
        this.headerOffset = 1;
      } else if (isArrayType(operandType)) {
        this.startIndex = operandType.start;
        this.headerOffset = ARRAY_HEADER_SIZE;
        const elementType = operandType.elementType;
        this.elementSize = sizeOf(elementType);

        this.type = new Pointer(elementType);
      } else {
        throw new UnreachableErr(`Trying to create Expr.Indexer from ${getTypeName(operandType)}`);
      }
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitIndexer(this);
    }
  }

  export class InRange extends Expr {
    constructor(public tempVar: VariableEntry, public checkExpr: Expr, public ranges: number[]) {
      super();
      this.stackNeutral = checkExpr.stackNeutral;
      this.type = BaseType.Boolean;

      if (ranges.length % 2 !== 0) {
        throw new UnreachableErr("Incomplete range");
      }
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitInRange(this);
    }
  }

  export class Literal extends Expr {
    constructor(public type: PascalType, public literal: number){
      super();
      this.stackNeutral = true;
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitLiteral(this);
    }
  }

  export class ShortCircuit extends Expr {
    constructor(public operator: Token, public a: Expr, public b: Expr){
      super();
      this.type = BaseType.Boolean;
      this.stackNeutral = a.stackNeutral && b.stackNeutral;
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitShortCircuit(this);
    }
  }

  export class StringConcat extends Expr {
    public operands: Expr[]
    constructor(public ptrVar: VariableEntry) {
      super();
      this.type = StringType.create(255);
      this.operands = [];
      this.stackNeutral = false;
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitStringConcat(this);
    }
  }

  export class StringCompare extends Expr {
    constructor(public operator: Token, public left: Expr, public right: Expr) {
      super();
      this.type = BaseType.Boolean;
      this.stackNeutral = left.stackNeutral && right.stackNeutral;
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitStringCompare(this);
    }
  }

  export class Typecast extends Expr {
    constructor(public operand: Expr, public type: PascalType){
      super();
      this.stackNeutral = operand.stackNeutral && !isString(type);
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitTypecast(this);
    }
  }

  export class Variable extends Expr {
    constructor(public entry: VariableEntry){
      super();
      this.type = entry.type;
      this.assignable = !entry.immutable;
      this.stackNeutral = true;
    }
    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitVariable(this);
    }
  }

  export class Refer extends Expr {
    constructor(public source: Expr.Variable) {
      super();
      this.type = source.type;
      this.stackNeutral = source.stackNeutral;
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitRefer(this);
    }
  }

  export class Deref extends Expr {
    constructor(public ptr: Expr) {
      super();
      this.stackNeutral = ptr.stackNeutral;
      if (!isPointer(ptr.type)) {
        throw new UnreachableErr("Trying to use Deref for non-pointer");
      }
      this.assignable = ptr.assignable;
      this.type = ptr.type.source;
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitDeref(this);
    }
  }

  export interface Visitor<T> {
    visitCall(expr: Call): T;
    visitCallLib(expr: CallLib): T;
    visitUnary(expr: Unary): T;
    visitBinary(expr: Binary): T;
    visitField(expr: Field): T;
    visitIndexer(expr: Indexer): T;
    visitInRange(expr: InRange): T;
    visitLiteral(expr: Literal): T;
    visitShortCircuit(expr: ShortCircuit): T;
    visitVariable(expr: Variable): T;
    visitDeref(expr: Deref): T;
    visitRefer(expr: Refer): T;
    visitStringConcat(expr: StringConcat): T;
    visitStringCompare(expr: StringCompare): T;
    visitTypecast(expr: Typecast): T;
  }
}

/* Statement Tree */
export abstract class Stmt {
  public abstract accept<T>(visitor: Stmt.Visitor<T>): T;
}

export namespace Stmt {
  export class CallStmt extends Stmt {
    constructor(public callExpr: Expr.Call | Expr.CallLib, public tempVar: VariableEntry) {
      super();
    }
    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitCallStmt(this);
    }
  }

  export class Compound extends Stmt {
    constructor(public statements: Stmt[]) {
      super();
    }
    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitCompound(this);
    }
  }

  export class ForLoop extends Stmt {
    constructor(public initializations: Stmt[], public condition: Expr,
      public increment: Stmt, public body: Stmt){
        super()
      }

      public accept<T>(visitor: Visitor<T>): T {
        return visitor.visitForLoop(this);
      }
  }

  export class IfElse extends Stmt {
    constructor(public condition: Expr, public body?: Stmt, public elseBody?: Stmt) {
      super();
    }
    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitIfElse(this);
    }
  }

  export class Increment extends Stmt {
    constructor(public target: Expr.Variable, public ascending: boolean) {
      super();
    }
    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitIncrement(this);
    }
  }

  export class LoopControl extends Stmt {
    constructor(public token: Token){ super(); }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitLoopControl(this);
    }
  }

  export class Read extends Stmt {
    constructor(public targets: Expr[], public newline: boolean, public inputFile?: Expr) {
      super();
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitRead(this);
    }
  }

  export class RepeatUntil extends Stmt {
    constructor(public finishCondition: Expr, public statements: Stmt[]) {
      super();
    }
    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitRepeatUntil(this);
    }
  }

  export class SetString extends Stmt {
    constructor(public target: Expr, public value: Expr) {
      super();
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitSetString(this);
    }
  }

  export class SetMemory extends Stmt {
    constructor(public target: Expr, public value: Expr) {
      super();
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitSetMemory(this);
    }
  }

  export class SetVariable extends Stmt {
    constructor(public target: Expr.Variable, public value: Expr) {
      super();
    }
    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitSetVariable(this);
    }
  }

  export class WhileDo extends Stmt {
    constructor(public condition: Expr, public body: Stmt) {
      super();
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitWhileDo(this);
    }
  }

  export class Write extends Stmt {
    constructor(public outputs: Expr[], public newline: boolean, public formats: WriteFormat[], public outputFile?: Expr) {
      super();
    }
    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitWrite(this);
    }
  }

  export interface Visitor<T> {
    visitCallStmt(stmt: CallStmt): T;
    visitCompound(stmt: Compound): T;
    visitForLoop(stmt: ForLoop): T;
    visitIfElse(stmt: IfElse): T;
    visitIncrement(stmt: Increment): T;
    visitLoopControl(stmt: LoopControl): T;
    visitRead(stmt: Read): T;
    visitRepeatUntil(stmt: RepeatUntil): T;
    visitSetString(stmt: SetString): T;
    visitSetMemory(stmt: SetMemory): T;
    visitSetVariable(stmt: SetVariable): T;
    visitWhileDo(stmt: WhileDo): T;
    visitWrite(stmt: Write): T;
  }
}

export interface WriteFormat {
  spacing: Expr | null;
  decimal: Expr | null;
}
