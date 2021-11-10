import { UnreachableErr } from "./errors";
import { Token, TokenType } from "./scanner";

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

export function isTypeEqual(a?: PascalType, b?: PascalType): boolean {
  if (a == null || b == null) return false;
  return a === b;
}

export function getTypeName(type?: PascalType): string {
  return BaseType[ type || BaseType.Void];
}

export abstract class Expr {
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
    literal: boolean | number | string;
    constructor(public token: Token){
      super();

      switch(token.type) {
        case TokenType.INTEGER: this.type = BaseType.Integer; break;
        case TokenType.REAL: this.type = BaseType.Real; break;
        case TokenType.CHAR: this.type = BaseType.Char; break;
        case TokenType.TRUE:
        case TokenType.FALSE:
          this.type = BaseType.Boolean;
        break;
        case TokenType.STRING:
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

  export interface Visitor<T> {
    visitUnary(expr: Unary): T;
    visitBinary(expr: Binary): T;
    visitLiteral(expr: Literal): T;
  }
}
