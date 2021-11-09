import {Expr, PascalType, BaseType} from "./expression";

export class ASTPrinter implements Expr.Visitor<string> {
  private tab: number;

  constructor(public root: Expr) {
    this.tab = 0;
  }

  print(): string {
    return this.root.accept(this);
  }

  visitUnary(expr: Expr.Unary): string {
    let str = `(${typeName(expr.type)} ${expr.operator.lexeme} `;
    str += expr.operand.accept(this);

    return str + ")";
  }
  visitBinary(expr: Expr.Binary): string {
    let str = `(${typeName(expr.type)} ${expr.operator.lexeme} `;
    str += expr.a.accept(this) + " ";
    str += expr.b.accept(this);

    return str + ")";
  }
  visitLiteral(expr: Expr.Literal): string {
    return expr.literal.toString();
  }

}

function typeName(type?: PascalType): string {
  if (type == null) return "???";

  return BaseType[type];
}
