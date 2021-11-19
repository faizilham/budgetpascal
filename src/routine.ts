import { BaseType, Expr, isTypeEqual, PascalType } from "./expression";
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

export type StringTable = Map<string, number>;

export class Program extends Routine {
  public stringTable?: StringTable;
  constructor(public name: string) {
    super();
  }
}

/* Identifier Table */
export type IdentifierEntry = VariableEntry | ConstantEntry;
export enum IdentifierType { Constant, Variable }

export enum VariableLevel { GLOBAL, LOCAL, UPPER }

export interface VariableEntry {
  entryType: IdentifierType.Variable;
  name: string;
  type: PascalType;
  index: number;
  initialized: boolean;
  level: VariableLevel;
  reserved: boolean; // only used for temp variables
}

export interface ConstantEntry {
  entryType: IdentifierType.Constant;
  name: string;
  value: Token;
}

export class IdentifierTable {
  table: {[key: string]: IdentifierEntry}
  tempVars: VariableEntry[];

  constructor() {
    this.table = {};
    this.tempVars = [];
  }

  public addVariable(name: string, type: PascalType): VariableEntry | null {
    if (this.table[name] != null) {
      return null;
    }

    const entry: VariableEntry = {
      entryType: IdentifierType.Variable,
      name,
      type,
      index: 0, // will be set by emitter
      initialized: false,
      level: VariableLevel.LOCAL,
      reserved: false
    }
    this.table[name] = entry;

    return entry;
  }

  public getTempVariable(type: PascalType): [VariableEntry, boolean] {
    for (const temp of this.tempVars) {
      if (!temp.reserved && isTypeEqual(type, temp.type)) {
        return [temp, true];
      }
    }

    const tempIndex = this.tempVars.length;
    const name = `tempvar::${tempIndex}`;
    const entry: VariableEntry = {
      entryType: IdentifierType.Variable,
      name,
      type,
      index: 0, // will be set by emitter
      initialized: false,
      level: VariableLevel.LOCAL,
      reserved: false
    };

    this.tempVars.push(entry);
    return [entry, false];
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
    constructor(public targets: Expr.Variable[], public newline: boolean) {
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
    constructor(public outputs: Expr[], public newline: boolean) {
      super();
    }
    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitWrite(this);
    }
  }

  export interface Visitor<T> {
    visitCompound(stmt: Compound): T;
    visitForLoop(stmt: ForLoop): T;
    visitIfElse(stmt: IfElse): T;
    visitIncrement(stmt: Increment): T;
    visitLoopControl(stmt: LoopControl): T;
    visitRead(stmt: Read): T;
    visitRepeatUntil(stmt: RepeatUntil): T;
    visitSetVariable(stmt: SetVariable): T;
    visitWhileDo(stmt: WhileDo): T;
    visitWrite(stmt: Write): T;
  }
}
