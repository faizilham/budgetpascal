import { BaseType, Expr, PascalType } from "./expression";
import { Token } from "./scanner";

export abstract class Routine {
  // declarations here
  declarations: Decl[] = [];
  identifiers: IdentifierTable;
  types: {[key: string]: PascalType};
  body: Stmt.Compound | null = null;

  constructor(){
    this.identifiers = new IdentifierTable();
    this.types = {
      "integer": BaseType.Integer,
      "boolean": BaseType.Boolean,
      "char": BaseType.Char,
      "real": BaseType.Real
    };
  }

  findIdentifier(name: string) {
    return this.identifiers.get(name);
  }

  findType(name: string): PascalType | undefined {
    return this.types[name];
  }
}

export class Program extends Routine {
  constructor(public name: string) {
    super();
  }
}

/* Identifier Table */
export type IdentifierEntry = VariableEntry | ConstantEntry;
export enum IdentifierType {
  Constant,
  Variable
}

export interface VariableEntry {
  entryType: IdentifierType.Variable;
  name: string;
  type: PascalType;
  index: number;
  initialized: boolean
}

export interface ConstantEntry {
  entryType: IdentifierType.Constant;
  name: string;
  value: Token;
}

export class IdentifierTable {
  table: {[key: string]: IdentifierEntry}
  varCount: number;
  constCount: number;

  constructor() {
    this.table = {};
    this.varCount = 0;
    this.constCount = 0;
  }

  public addVariable(name: string, type: PascalType): VariableEntry | null {
    if (this.table[name] != null) {
      return null;
    }

    const entry: VariableEntry = {
      entryType: IdentifierType.Variable,
      name,
      type,
      index: this.varCount++,
      initialized: false
    }
    this.table[name] = entry;

    return entry;
  }

  public addConst(name: string, value: Token): ConstantEntry | null {
    if (this.table[name] != null) {
      return null;
    }

    const entry: ConstantEntry = {
      entryType: IdentifierType.Constant,
      name,
      value
    }
    this.table[name] = entry;
    this.constCount++;

    return entry;
  }

  public get(name: string): IdentifierEntry | null {
    return this.table[name] || null;
  }
}

/* Declaration Tree */
export abstract class Decl {
  public abstract accept<T>(visitor: Decl.Visitor<T>): T;
}

export namespace Decl {
  export class Variable extends Decl {
    constructor(public entry: VariableEntry) {
      super();
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitVariableDecl(this);
    }
  }

  export interface Visitor<T> {
    visitVariableDecl(decl: Decl.Variable): T
  }
}

/* Statement Tree */
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
