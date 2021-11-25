import { UnreachableErr } from "./errors";
import { Subroutine, VariableEntry } from "./routine";
import { Token } from "./scanner";

export type PascalType = BaseType | MemoryType | Pointer;

export enum BaseType {
  Void,
  Boolean,
  Char,
  Integer,
  Real,
}

export interface MemoryType {
  bytesize: number
  typename(): string;
}

export class StringType implements MemoryType {
  bytesize: number;
  private constructor(public size: number){
    this.bytesize = size + 1;
  }

  private static sizes: {[key: number]: StringType} = {};

  static create(size: number = 255): StringType {
    let strtype = StringType.sizes[size];

    if (strtype == null) {
      strtype = new StringType(size);
      StringType.sizes[size] = strtype;
    }

    return strtype;
  }

  typename(): string {
    return this.size < 255 ? `String[${this.size}]` : "String";
  }
}

export class ArrayType implements MemoryType {
  bytesize: number;
  length: number;
  constructor(public start: number, public end: number, public elementType: PascalType) {
    this.length = end - start + 1;
    const elementSize = sizeOf(elementType);
    this.bytesize = this.length * elementSize;
  }

  equalTo(arr: ArrayType) {
    return this.start === arr.start && this.end === arr.end && isTypeEqual(this.elementType, arr.elementType);
  }

  typename(): string {
    let type: PascalType = this;
    const dimensions = [];

    do {
      const arrtype = type as ArrayType;
      dimensions.push(`${arrtype.start}..${arrtype.end}`);
      type = arrtype.elementType;
    } while(type instanceof ArrayType);

    return `Array[${dimensions.join(", ")}] of ${getTypeName(type)}`;
  }
}

export class RecordType implements MemoryType {
  bytesize: number;
  name: string;
  fields: {[key: string]: {type: PascalType, offset: number}};

  constructor() {
    this.bytesize = 0;
    this.name = "";
    this.fields = {};
  }

  addField(name: string, type: PascalType): boolean {
    if (this.fields[name] != null) return false;

    const size = sizeOf(type);
    const offset = this.bytesize;
    this.bytesize += size;

    this.fields[name] = {type, offset};

    return true;
  }

  typename(): string {
    return this.name.length === 0 ? '""' : this.name;
  }
}

export class Pointer {
  constructor(public source: PascalType) {}
}

export function isBaseType(type?: PascalType): type is BaseType {
  return !isNaN(type as any);
}

export function isNumberType(type?: PascalType): boolean {
  return type === BaseType.Integer || type === BaseType.Real;
}

export function isOrdinal(type?: PascalType): boolean {
  return type === BaseType.Integer || type === BaseType.Boolean || type === BaseType.Char;
}

export function isBool(type?: PascalType): boolean {
  return type === BaseType.Boolean;
}

export function isMemoryType(type?: PascalType): type is MemoryType {
  return type != null && (type as MemoryType).bytesize != null;
}

export function isString(type?: PascalType): type is StringType {
  return type != null && (type as StringType).size != null;
}

export function isStringLike(type?: PascalType): boolean {
  return type === BaseType.Char || isString(type);
}

export function isArrayType(type?: PascalType): type is ArrayType {
  return type != null && (type as ArrayType).elementType != null;
}

export function isArrayOf(arrType?: PascalType, elementType?: PascalType): boolean {
  return isArrayType(arrType) && isTypeEqual(arrType.elementType, elementType);
}

export function isRecord(type?: PascalType): type is RecordType {
  return type != null && (type as RecordType).fields != null;
}

export function isPointer(type?: PascalType): type is Pointer {
  return type != null && (type as Pointer).source != null;
}

type TypeCheckFunc = (type?: PascalType) => boolean;

export function isPointerTo(ptrType?: PascalType, testType?: PascalType | TypeCheckFunc): boolean {
  if (!isPointer(ptrType)) return false;

  if (testType instanceof Function) {
    return testType(ptrType.source);
  }

  return isTypeEqual(ptrType.source, testType);
}

export function isTypeEqual(a?: PascalType, b?: PascalType): boolean {
  if (a == null || b == null) return false;
  if (a === b) return true;
  if (isString(a) && isString(b)) return true;
  if (isPointer(a) && isPointer(b)) return isTypeEqual(a.source, b.source);
  if (isArrayType(a) && isArrayType(b)) return a.equalTo(b);
  // record types are unique, so it needs to equal like a === b

  return false;
}

export function getTypeName(type?: PascalType): string {
  if (type == null || type === BaseType.Void) return "untyped";
  else if (isBaseType(type)) return BaseType[type];
  else if (isMemoryType(type)) return type.typename();
  return `Unknown`;
}

export function sizeOf(type: PascalType): number {
  if (isMemoryType(type)) return type.bytesize;
  if (type === BaseType.Real) return 8;
  if (type === BaseType.Boolean || type === BaseType.Char) return 1;
  return 4;
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
      let stackNeutral = isBaseType(this.type);
      if (stackNeutral) {
        for (const arg of args) {
          if (!arg.stackNeutral) {
            stackNeutral = false;
            break;
          }
        }
      }

      this.stackNeutral = stackNeutral;
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

  export class Field extends Expr {
    constructor(public operand: Expr, public fieldOffset: number, public fieldType: PascalType) {
      super();
      this.assignable = operand.assignable;
      this.stackNeutral = operand.stackNeutral;
      this.type = new Pointer(fieldType);
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitField(this);
    }
  }

  export class Indexer extends Expr {
    startIndex: number
    elementSize: number;
    constructor(public operand: Expr, public index: Expr) {
      super();
      this.stackNeutral = operand.stackNeutral && index.stackNeutral;
      this.assignable = operand.assignable;

      const operandType = operand.type;

      if (isString(operandType)) {
        this.startIndex = 0; // because str[0] points to its length
        this.elementSize = sizeOf(BaseType.Char);
        this.type = new Pointer(BaseType.Char);
      } else if (isArrayType(operandType)) {
        this.startIndex = operandType.start;

        const elementType = operandType.elementType;
        this.elementSize = sizeOf(elementType);

        this.type = new Pointer(elementType);
      } else {
        throw new UnreachableErr(`Trying to create Expr.Indexer from ${getTypeName(operandType)}`);
      }
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitIndexer(this);
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
      this.type = entry.type;
      this.assignable = !entry.immutable;
      this.stackNeutral = true;
    }
    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitVariable(this);
    }
  }

  export class Refer extends Expr {
    constructor(public source: Expr.Variable) {
      super();
      this.type = source.type;
      this.stackNeutral = source.stackNeutral;
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitRefer(this);
    }
  }

  export class Deref extends Expr {
    constructor(public ptr: Expr) {
      super();
      this.stackNeutral = ptr.stackNeutral;
      if (!isPointer(ptr.type)) {
        throw new UnreachableErr("Trying to use Deref for non-pointer");
      }
      this.assignable = ptr.assignable;
      this.type = ptr.type.source;
    }

    public accept<T>(visitor: Visitor<T>): T {
      return visitor.visitDeref(this);
    }
  }

  export interface Visitor<T> {
    visitCall(expr: Call): T;
    visitUnary(expr: Unary): T;
    visitBinary(expr: Binary): T;
    visitField(expr: Field): T;
    visitIndexer(expr: Indexer): T;
    visitLiteral(expr: Literal): T;
    visitShortCircuit(expr: ShortCircuit): T;
    visitVariable(expr: Variable): T;
    visitDeref(expr: Deref): T;
    visitRefer(expr: Refer): T;
    visitStringConcat(expr: StringConcat): T;
    visitStringCompare(expr: StringCompare): T;
    visitTypecast(expr: Typecast): T;
  }
}
