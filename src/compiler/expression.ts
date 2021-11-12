import { UnreachableErr } from "./errors";
import { Token, TokenTag } from "./scanner";

export enum BaseType {
  Void,
  Boolean,
  Char,
  Integer,
  Real,
}

export type PascalType = BaseType;

export function isNumberType(type?: PascalType): boolean {
  return type === BaseType.Integer || type === BaseType.Real;
}

export function isBool(type?: PascalType): boolean {
  return type === BaseType.Boolean;
}

export function isTypeEqual(a?: PascalType, b?: PascalType): boolean {
  if (a == null || b == null) return false;
  return a === b;
}

export function getTypeName(type?: PascalType): string {
  return BaseType[ type || BaseType.Void];
}

export abstract class Expr {
  assignable: boolean = false;
  type: PascalType | undefined;
  public abstract accept<T>(visitor: Expr.Visitor<T>) : T;
}

export namespace Expr {
  export class Unary extends Expr {
    constructor(public operator: Token, public operand: Expr){
      super();
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitUnary(this);
    }
  }

  export class Binary extends Expr {
    constructor(public operator: Token, public a: Expr, public b: Expr){
      super();
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitBinary(this);
    }
  }

  export class Literal extends Expr {
    public literal: boolean | number | string;
    constructor(public token: Token){
      super();

      switch(token.tag) {
        case TokenTag.INTEGER: this.type = BaseType.Integer; break;
        case TokenTag.REAL: this.type = BaseType.Real; break;
        case TokenTag.CHAR: this.type = BaseType.Char; break;
        case TokenTag.TRUE:
        case TokenTag.FALSE:
          this.type = BaseType.Boolean;
        break;
        case TokenTag.STRING:
          // TODO: fill after string type exist
        break;
      }

      if (token.literal == null) {
        // should not go here
        throw new UnreachableErr("Can't build literal without value");
      }

      this.literal = token.literal;
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitLiteral(this);
    }
  }

  export class ShortCircuit extends Expr {
    constructor(public operator: Token, public a: Expr, public b: Expr){
      super();
      this.type = BaseType.Boolean;
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitShortCircuit(this);
    }
  }

  export class GlobalVar extends Expr {
    constructor(public name: Token, public type: PascalType, public index: number){
      super();
      this.assignable = true;
    }
    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitGlobalVar(this);
    }
  }

  export interface Visitor<T> {
    visitUnary(expr: Unary): T;
    visitBinary(expr: Binary): T;
    visitLiteral(expr: Literal): T;
    visitShortCircuit(expr: ShortCircuit): T;
    visitGlobalVar(expr: GlobalVar): T;
  }
}
