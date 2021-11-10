export class UnreachableErr extends Error {
  constructor(message: string) { super(); }
}

export class ParserError extends Error {
  constructor(message: string) { super(message); }
}
