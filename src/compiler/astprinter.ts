import {Expr, PascalType, BaseType} from "./expression";
import { Program, Stmt } from "./routine";

export class ASTPrinter implements Expr.Visitor<string>, Stmt.Visitor<string> {
  private tab: number;

  constructor(public root: Program) {
    this.tab = 0;
  }

  print(): string {
    let result = `program ${this.root.name}\n`;

    result += this.root.statements.accept(this);

    return result;
  }

  /* Statements */

  visitCompound(stmt: Stmt.Compound): string {
    const result = [this.tabbed("{")];
    this.tab++;

    for (let s of stmt.statements) {
      result.push(s.accept(this));
    }

    this.tab--;
    result.push(this.tabbed("}"));

    return result.join("\n");
  }

  visitWrite(stmt: Stmt.Write): string {
    let results = ["write"];
    if (stmt.newline) results[0] += "ln";

    for (let e of stmt.outputs) {
      results.push(e.accept(this));
    }

    return this.tabbed(results.join(" "));
  }

  tabbed(s: string) {
    return `${"  ".repeat(this.tab)}${s}`;
  }

  /* Expressions */

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
    if (expr.type === BaseType.Char){
      return "#" + expr.literal.toString();
    }
    return expr.literal.toString();
  }

}

function typeName(type?: PascalType): string {
  if (type == null) return "???";

  return BaseType[type];
}
