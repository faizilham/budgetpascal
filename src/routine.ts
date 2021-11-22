import { BaseType, Expr, isTypeEqual, PascalType } from "./expression";
import { Token } from "./scanner";

export abstract class Routine {
  // declarations here
  identifiers: IdentifierTable;
  body: Stmt.Compound | null = null;
  parent: Routine | null;
  id: number;

  constructor(id: number, parent: Routine | null = null){
    this.identifiers = new IdentifierTable();
    this.parent = parent;
    this.id = id;
  }

  findIdentifier(name: string): IdentifierEntry | null{
    const local = this.identifiers.get(name);
    if (local) return local;
    if (!this.parent) return null;
    return this.parent.findIdentifier(name);
  }

  findType(name: string): PascalType | null {
    const local = this.identifiers.getType(name);
    if (local) return local;
    return this.parent && this.parent.findType(name);
  }
}

export type StringTable = Map<string, number>;

export class Program extends Routine {
  public stringTable?: StringTable;
  constructor(public name: string) {
    super(0);
  }
}

export class Subroutine extends Routine{
  readonly entryType = IdentifierType.Subroutine;
  params: VariableEntry[];
  refParams: number[];
  returnVar: VariableEntry;
  absoluteName: string;
  constructor(public id: number, public name: string, returnType: PascalType, parent: Routine) {
    super(id, parent);
    this.params = [];
    this.refParams = [];

    if (parent instanceof Subroutine) {
      this.absoluteName = `${parent.absoluteName}.${name}`;
    } else {
      this.absoluteName = name;
    }

    this.returnVar = {
      entryType: IdentifierType.Variable,
      name,
      type: returnType,
      ownerId: id,
      index: 0, // will be set by emitter
      initialized: false,
      level: VariableLevel.LOCAL,
      immutable: false,
      returnVar: true,
      paramVar: false,
      paramType: ParamType.VALUE,
      temporary: false,
      reserved: false,
      tempUsed: 0,
      memsize: 0,
      memoffset: 0,
    };

    this.identifiers.addSubroutine(this, true);
  }

  addParam(name: string, type: PascalType, paramType: ParamType): VariableEntry | null {
    const entry = this.identifiers.addVariable(name, type, this.id);
    if (entry){
      entry.paramVar = true;
      entry.paramType = paramType;
      if (paramType === ParamType.CONST) {
        entry.immutable = true;
      } else if (paramType === ParamType.REF) {
        // record index of the reference parameter
        this.refParams.push(this.params.length);
      }
      this.params.push(entry)
    }

    return entry;
  }
}

/* Identifier Table */
export type IdentifierEntry = VariableEntry | ConstantEntry | TypeEntry | Subroutine;
export enum IdentifierType { Constant, Variable, TypeDef, Subroutine }

export enum VariableLevel { GLOBAL, LOCAL, UPPER }
export enum ParamType { VALUE, CONST, REF }

export interface VariableEntry {
  entryType: IdentifierType.Variable;
  name: string;
  type: PascalType;
  ownerId: number;
  index: number;
  initialized: boolean;
  level: VariableLevel;
  immutable: boolean;

  returnVar: boolean; // only used for return var in subroutines

  paramVar: boolean;
  paramType: ParamType; // only used for parameter vars

  temporary: boolean;
  reserved: boolean; // only used for temp variables
  tempUsed: number; // only used for temp variables

  // for Upper Var only
  memsize: number;
  memoffset: number;
}

export interface ConstantEntry {
  entryType: IdentifierType.Constant;
  name: string;
  value: Token;
}

export interface TypeEntry {
  entryType: IdentifierType.TypeDef;
  type: PascalType
}

export class IdentifierTable {
  private table: {[key: string]: IdentifierEntry}
  private tempVars: VariableEntry[];
  variables: VariableEntry[];
  subroutines: Subroutine[];

  constructor() {
    this.table = {
      "integer": {entryType: IdentifierType.TypeDef, type: BaseType.Integer},
      "boolean": {entryType: IdentifierType.TypeDef, type: BaseType.Boolean},
      "char": {entryType: IdentifierType.TypeDef, type: BaseType.Char},
      "real": {entryType: IdentifierType.TypeDef, type: BaseType.Real},
    };

    this.tempVars = [];
    this.variables = [];
    this.subroutines = [];
  }

  public addVariable(name: string, type: PascalType, ownerId: number): VariableEntry | null {
    if (this.table[name] != null) {
      return null;
    }

    const entry: VariableEntry = {
      entryType: IdentifierType.Variable,
      name,
      type,
      ownerId,
      index: 0, // will be set by emitter
      initialized: false,
      level: VariableLevel.LOCAL,
      immutable: false,
      returnVar: false,
      paramVar: false,
      paramType: ParamType.VALUE,
      temporary: false,
      reserved: false,
      tempUsed: 0,
      memsize: 0,
      memoffset: 0,
    }
    this.table[name] = entry;
    this.variables.push(entry);

    return entry;
  }

  public addSubroutine(subroutine: Subroutine, self: boolean = false): boolean {
    const name = subroutine.name;
    if (self) {
      this.table[name] = subroutine;
      return true;
    }

    if (this.table[name] != null) {
      return false;
    }

    this.table[name] = subroutine;
    this.subroutines.push(subroutine);
    return true;
  }

  public getTempVariable(type: PascalType, ownerId: number): VariableEntry {
    for (const temp of this.tempVars) {
      if (!temp.reserved && isTypeEqual(type, temp.type)) {
        return temp;
      }
    }

    const tempIndex = this.tempVars.length;
    const name = `tempvar::${tempIndex}`;
    const entry: VariableEntry = {
      entryType: IdentifierType.Variable,
      name,
      type,
      ownerId,
      index: 0, // will be set by emitter
      initialized: false,
      level: VariableLevel.LOCAL,
      immutable: false,
      returnVar: false,
      paramVar: false,
      paramType: ParamType.VALUE,
      temporary: true,
      reserved: false,
      tempUsed: 0,
      memsize: 0,
      memoffset: 0,
    };

    this.tempVars.push(entry);
    this.variables.push(entry);
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

    return entry;
  }

  public get(name: string): IdentifierEntry | null {
    return this.table[name] || null;
  }

  public getType(name: string): PascalType | null {
    const entry = this.table[name];
    if (!entry || entry.entryType !== IdentifierType.TypeDef) {
      return null
    }

    return entry.type;
  }
}


/* Statement Tree */
export abstract class Stmt {
  public abstract accept<T>(visitor: Stmt.Visitor<T>): T;
}

export namespace Stmt {
  export class CallStmt extends Stmt {
    constructor(public callExpr: Expr.Call, public tempVar: VariableEntry) {
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
    visitCallStmt(stmt: CallStmt): T;
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
