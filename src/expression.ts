import { Subroutine, VariableEntry } from "./routine";
import { Token } from "./scanner";

export enum BaseType {
  Void,
  Boolean,
  Char,
  Integer,
  Real,
}

export class StringType {
  private constructor(public size: number){}

  private static sizes: {[key: number]: StringType} = {};

  static create(size: number = 255): StringType {
    let strtype = StringType.sizes[size];

    if (strtype == null) {
      strtype = new StringType(size);
      StringType.sizes[size] = strtype;
    }

    return strtype;
  }
}

export type PascalType = BaseType | StringType;

export function isBaseType(type?: PascalType): type is BaseType {
  return !isNaN(type as any);
}

export function isNumberType(type?: PascalType): boolean {
  return type === BaseType.Integer || type === BaseType.Real;
}

export function isOrdinal(type?: PascalType): boolean {
  return type == BaseType.Integer || type == BaseType.Boolean || type == BaseType.Char;
}

export function isBool(type?: PascalType): boolean {
  return type === BaseType.Boolean;
}

export function isString(type?: PascalType): type is StringType {
  return type != null && (type as StringType).size != null;
}

export function isStringLike(type?: PascalType): boolean {
  return type === BaseType.Char || isString(type);
}

export function isTypeEqual(a?: PascalType, b?: PascalType): boolean {
  if (a == null || b == null) return false;
  if (a === b) return true;
  if (isString(a) && isString(b)) return true;

  return false;
}

export function getTypeName(type?: PascalType): string {
  if (type == null || type === BaseType.Void) return "untyped";
  if (isString(type)) return type.size < 255 ? `String[${type.size}]` : "String";
  return BaseType[type];
}

export class Range {
  constructor(public type: BaseType, public start: number, public end: number){}
}

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
      this.stackNeutral = isBaseType(this.type);
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitCall(this);
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
      this.assignable = true;
      this.type = entry.type;
      this.stackNeutral = true;
    }
    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitVariable(this);
    }
  }

  export interface Visitor<T> {
    visitCall(expr: Call): T;
    visitUnary(expr: Unary): T;
    visitBinary(expr: Binary): T;
    visitLiteral(expr: Literal): T;
    visitShortCircuit(expr: ShortCircuit): T;
    visitVariable(expr: Variable): T;
    visitStringConcat(expr: StringConcat): T;
    visitStringCompare(expr: StringCompare): T;
    visitTypecast(expr: Typecast): T;
  }
}
