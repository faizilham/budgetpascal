export const ARRAY_HEADER_SIZE = 4;

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
    this.bytesize = ARRAY_HEADER_SIZE + this.length * elementSize;
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

export type TypeCheckFunc = (type?: PascalType) => boolean;

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
