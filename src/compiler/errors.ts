import { Token } from "./scanner";

export class UnreachableErr extends Error {
  constructor(message: string) { super(message); }
}

export class ParserError extends Error {
  constructor(public token: Token, message: string) { super(message); }
}

export namespace ErrLogger {
  export interface Reporter {
    error(...messages: any[]): void;
  }

  export const logger: Reporter = console;
}
