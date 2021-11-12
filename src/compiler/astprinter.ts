import {Expr, PascalType, BaseType} from "./expression";
import { Program, Stmt } from "./routine";

export class ASTPrinter implements Expr.Visitor<string>, Stmt.Visitor<string> {
  private tab: number;

  constructor(public root: Program) {
    this.tab = 0;
  }
  print(): string {
    if (!this.root.body) return "<error>";

    let result = `program ${this.root.name}\n`;

    result += this.root.body.accept(this);

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

  visitForLoop(stmt: Stmt.ForLoop): string {
    //TODO:
    throw new Error("Method not implemented.");
  }

  visitIfElse(stmt: Stmt.IfElse): string {
    let results = [];

    results.push(this.tabbed(`if ${stmt.condition.accept(this)}:`));

    this.tab++;
    if (!stmt.body) {
      results.push(this.tabbed("<empty>"));
    } else {
      results.push(stmt.body.accept(this));
    }
    this.tab--;

    if (stmt.elseBody) {
      results.push(this.tabbed("else:"));
      this.tab++;
      results.push(stmt.elseBody.accept(this));
      this.tab--;
    }

    return results.join("\n");
  }

  visitIncrement(stmt: Stmt.Increment): string {
    //TODO:
    throw new Error("Method not implemented.");
  }

  visitLoopControl(stmt: Stmt.LoopControl): string {
    return this.tabbed(stmt.token.lexeme);
  }

  visitRepeatUntil(stmt: Stmt.RepeatUntil): string {
    //TODO:
    throw new Error("Method not implemented.");
  }

  visitWhileDo(stmt: Stmt.WhileDo): string {
    //TODO:
    throw new Error("Method not implemented.");
  }

  visitWrite(stmt: Stmt.Write): string {
    let results = ["write"];
    if (stmt.newline) results[0] += "ln";

    for (let e of stmt.outputs) {
      results.push(e.accept(this));
    }

    return this.tabbed(results.join(" "));
  }

  visitSetVariable(stmt: Stmt.SetVariable): string {
    const target = stmt.target.accept(this);
    const value = stmt.value.accept(this);

    return this.tabbed(`${target} := ${value}`);
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
  visitShortCircuit(expr: Expr.ShortCircuit): string {
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
  visitVariable(expr: Expr.Variable): string {
    return expr.entry.name;
  }

}

function typeName(type?: PascalType): string {
  if (type == null) return "???";

  return BaseType[type];
}
