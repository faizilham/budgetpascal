import { Expr } from "./expression";

export abstract class Routine {
  // declarations here
  constructor(public body: Stmt.Compound){}
}

export class Program extends Routine {
  constructor(public name: string, body: Stmt.Compound) {
    super(body);
  }
}

export abstract class Stmt {
  public abstract accept<T>(visitor: Stmt.Visitor<T>): T;
}

export namespace Stmt {
  export class Compound extends Stmt {
    constructor(public statements: Stmt[]) {
      super();
    }
    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitCompound(this);
    }
  }

  export class Write extends Stmt {
    constructor(public outputs: Expr[], public newline: boolean) {
      super();
    }
    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitWrite(this);
    }
  }

  export interface Visitor<T> {
    visitCompound(stmt: Compound): T;
    visitWrite(stmt: Write): T;
  }
}
