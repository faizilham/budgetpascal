import { threadId } from "worker_threads";
import { ParserError, UnreachableErr } from "./errors";
import { BaseType, Expr, getTypeName, isBool, isNumberType as isNumberType, isTypeEqual, PascalType } from "./expression";
import { Program, Stmt } from "./routine";
import { Scanner, Token, TokenTag } from "./scanner";

enum Precedence {
  None,
  Relational, // all relational operators
  Sums,       // + - or xor
  Products,   // * / div mod and shl shr
  Unary,      // not & unary +-
  Call,       // ( ) .
}

// PrecedenceEntry: <prefix function, infix function, precedence>
type PrefixExprHandler = ()=>Expr;
type InfixExprHandler = ((left: Expr)=>Expr);
type PrecedenceEntry = [PrefixExprHandler | null, InfixExprHandler | null, Precedence];
type PrecedenceTable = {[key in TokenTag]?: PrecedenceEntry};

export class Parser {
  scanner: Scanner;
  current: Token;
  previous: Token;
  precedenceRule: PrecedenceTable;
  hasError: boolean;

  constructor(public text: string) {
    this.precedenceRule = this.buildPrecedence();

    this.scanner = new Scanner(text);
    this.current = this.scanner.eofToken(); // placeholder value
    this.previous = this.current;
    this.hasError = false;
  }

  parse(): Program | undefined  {
    try {
      this.advance();
      const prog = this.program();
      if (this.hasError) return;
      return prog;
    } catch(e: any) {
      if (e instanceof ParserError) {
        this.reportError(e)
      } else {
        console.error("Panic: ", e);
      }
    }
  }

  private program(): Program | undefined {
    this.consume(TokenTag.PROGRAM, "Expect 'program'.");
    this.consume(TokenTag.IDENTIFIER, "Expect identifier program name.");
    const programName = this.previous.lexeme;
    this.consume(TokenTag.SEMICOLON, "Expect ';' after program name.");

    const statements = this.compound();
    this.consume(TokenTag.DOT, "Expect '.' after end.");

    return new Program(programName, statements);
  }

  /** Statement **/
  private statement(): Stmt {
    switch(this.current.tag) {
      case TokenTag.BEGIN: return this.compound();

      case TokenTag.WRITE:
      case TokenTag.WRITELN:
        return this.writeStmt();

      default:
        // defaulted to procedural call statement, will remove this error
        throw this.errorAtCurrent("Expect statement");
    }
  }

  private synchronizeStatement() {
    while(this.current.tag !== TokenTag.EOF) {
      if (this.previous.tag === TokenTag.SEMICOLON) return;

      switch(this.current.tag) {
        case TokenTag.IF:
        case TokenTag.THEN:
        case TokenTag.ELSE:
        case TokenTag.FOR:
        case TokenTag.TO:
        case TokenTag.DOWNTO:
        case TokenTag.DO:
        case TokenTag.WHILE:
        case TokenTag.REPEAT:
        case TokenTag.UNTIL:
        case TokenTag.BEGIN:
        case TokenTag.END:
        case TokenTag.WRITE:
        case TokenTag.WRITELN:
        case TokenTag.READ:
        case TokenTag.READLN:
          return;
        default:
          this.advance();
      }
    }
  }

  private compound(): Stmt.Compound {
    this.consume(TokenTag.BEGIN, "Expect 'begin'.");

    const statements: Stmt[] = [];

    while (!this.check(TokenTag.EOF) && !this.check(TokenTag.END)) {
      try {
        statements.push(this.statement());

        if (!this.check(TokenTag.EOF) && !this.check(TokenTag.END)) {
          this.consume(TokenTag.SEMICOLON, "Expect ';' between statements.");
        }
      } catch(e) {
        if (e instanceof ParserError) {
          this.reportError(e);
          this.synchronizeStatement();
        } else {
          throw e; // panicking, propagate to upper layer
        }
      }
    }

    this.consume(TokenTag.END, "Expect 'end'.");

    return new Stmt.Compound(statements);
  }

  private writeStmt(): Stmt {
    this.advance();
    const newline = this.previous.tag === TokenTag.WRITELN;
    const outputs: Expr[] = [];

    if (this.match(TokenTag.LEFT_PAREN)) {
      while(!this.check(TokenTag.RIGHT_PAREN)) {
        const exprStart = this.current;
        const expr = this.expression();

        if (!this.isPrintable(expr.type)) {
          throw this.errorAt(exprStart, `Can't write type ${getTypeName(expr.type)} to console`);
        }
        outputs.push(expr);

        if (!this.check(TokenTag.RIGHT_PAREN)){
          this.consume(TokenTag.COMMA, "Expect ',' between expressions.")
        }
      }

      this.consume(TokenTag.RIGHT_PAREN, "Expect ')' after expression.");
    }

    return new Stmt.Write(outputs, newline);
  }

  private isPrintable(type?: PascalType): boolean {
    if (!type) return false;

    // TODO: add string type
    return type === BaseType.Boolean || type === BaseType.Char ||
      type === BaseType.Integer || type === BaseType.Real;
  }

  /** Expression Parsing **/

  private expression(): Expr {
    return this.parsePrecedence(Precedence.Relational);
  }

  private parsePrecedence(precedence: Precedence): Expr {
    this.advance();

    const prefixRule = this.precedence(this.previous);

    if (!prefixRule || !prefixRule[0]) {
      throw this.errorAtPrevious("Expect expression");
    }

    let lefthand = prefixRule[0]();

    let currentRule = this.precedence(this.current);

    while (precedence <= currentRule[2]) {
      this.advance();
      const infixRule = currentRule[1] as InfixExprHandler;
      lefthand = infixRule(lefthand);

      currentRule = this.precedence(this.current);
    }

    return lefthand;
  }

  private unary(): Expr {
    const operator = this.previous;
    const operand = this.parsePrecedence(Precedence.Unary);

    const errorOperandType = () => {
      const op = operator.lexeme;
      return this.errorAt(operator, `Unknown operator '${op}' for type ${getTypeName(operand.type)}`);
    };

    // type check
    switch (operator.tag) {
      case TokenTag.PLUS: {
        if (!isNumberType(operand.type)) {
          throw errorOperandType();
        }
        return operand; // no need to contain the operand inside a Unary tree
      }

      case TokenTag.MINUS: {
        if (!isNumberType(operand.type)) {
          throw errorOperandType();
        }
        break;
      }

      case TokenTag.NOT: { // logic not and bitwise not
        if (!isTypeEqual(operand.type, BaseType.Boolean) &&
            !isTypeEqual(operand.type, BaseType.Integer)) {
          throw errorOperandType();
        }
        break;
      }

      default:
        throw new UnreachableErr(`Unknown unary operator ${operator.lexeme}`);
    }

    const expr = new Expr.Unary(operator, operand);
    expr.type = operand.type;
    return expr;
  }

  private binary(left: Expr): Expr {
    const operator = this.previous;
    const precedence = this.precedence(operator)[2];
    const right = this.parsePrecedence(precedence + 1);

    let exprType: PascalType = BaseType.Void;

    const errorOperandType = () => {
      const op = operator.lexeme;
      const ltype = getTypeName(left.type);
      const rtype = getTypeName(right.type);
      return this.errorAt(operator, `Unknown operator '${op}' for type ${ltype} and ${rtype}`);
    }

    switch(operator.tag) {

      // math operators

      // (number, number) -> number
      case TokenTag.PLUS:
        //TODO: string-string, string-char, char-char plus operator
        // use special expression AST for string concatenation

        // fallthrough
      case TokenTag.MINUS:
      case TokenTag.MULTIPLY: {
        if (!isNumberType(left.type) || !isNumberType(right.type)) {
          throw errorOperandType();
        }

        const leftType = left.type as BaseType;
        const rightType = right.type as BaseType;

        if (leftType === BaseType.Real || rightType === BaseType.Real) {
          exprType = BaseType.Real;
        } else {
          exprType = BaseType.Integer;
        }

        break;
      }

      case TokenTag.SLASH: { // (number, number) -> real
        if (!isNumberType(left.type) || !isNumberType(right.type)) {
          throw errorOperandType();
        }

        exprType = BaseType.Real;
        break;
      }

      case TokenTag.DIV: // (int, int) -> int
      case TokenTag.MOD:
      case TokenTag.SHL:
      case TokenTag.SHR: {
        if (!isTypeEqual(left.type, BaseType.Integer) ||
            !isTypeEqual(right.type, BaseType.Integer)) {
          throw errorOperandType();
        }

        exprType = BaseType.Integer;
        break;
      }

    //   TokenType.AND
    //   TokenType.OR
      case TokenTag.XOR: {
        if (isTypeEqual(left.type, BaseType.Integer) &&
            isTypeEqual(right.type, BaseType.Integer)) {
          exprType = BaseType.Integer;
        } else if (isBool(left.type) && isBool(right.type)) {
          exprType = BaseType.Boolean
        } else {
          throw errorOperandType();
        }

        break;
      }

      case TokenTag.EQUAL:
      case TokenTag.GREATER:
      case TokenTag.LESS:
      case TokenTag.GREATER_EQ:
      case TokenTag.LESS_EQ:
      case TokenTag.NOT_EQ: {
        //TODO: string-string, and string-char comparison
        // use special expression AST for string comparison

        if ((isNumberType(left.type) && isNumberType(right.type)) ||
            (isBool(left.type) && isBool(right.type)) ||
            ((left.type === BaseType.Char) && (right.type === BaseType.Char))
            ) {
          exprType = BaseType.Boolean;
        } else {
          throw errorOperandType();
        }

        break;
      }

      default:
        throw new UnreachableErr(`Unknown binary operator ${operator.lexeme}`);
    }

    const expr = new Expr.Binary(operator, left, right);
    expr.type = exprType;

    return expr;
  }

  private literals(): Expr {
    const expr = new Expr.Literal(this.previous);
    return expr;
  }

  private grouping(): Expr {
    const expr = this.expression();
    this.consume(TokenTag.RIGHT_PAREN, "Expect ')' after expression");

    return expr;
  }

  /** Parser primitives **/

  private precedence(token: Token): PrecedenceEntry {
    return this.precedenceRule[token.tag] || [null, null, Precedence.None];
  }

  private advance(): Token {
    this.previous = this.current;
    for (;;) {
      this.current = this.scanner.scanToken();

      if (this.current.tag !== TokenTag.UNKNOWN) break;

      throw this.errorAtCurrent(this.scanner.lastError);
    }

    return this.previous;
  }

  private check(type: TokenTag): boolean {
    return this.current.tag === type;
  }

  private match(type: TokenTag): boolean {
    if (!this.check(type)) {
      return false;
    }

    this.advance();

    return true;
  }

  private consume(type: TokenTag, errMessage: string) {
    if (!this.match(type)){
      throw this.errorAtCurrent(errMessage);
    }
  }

  private errorAtCurrent(message: string) {
    return this.errorAt(this.current, message);
  }

  private errorAtPrevious(message: string) {
    return this.errorAt(this.previous, message);
  }

  private errorAt(token: Token, message: string) {
    this.hasError = true;
    return new ParserError(token, message);
  }

  private reportError(err: ParserError) {
    console.error(`Error on line ${err.token.line} col ${err.token.column}: ${err.message}`);
  }

  private buildPrecedence(): PrecedenceTable {
    const parser = this;

    function entry(prefix: PrefixExprHandler | null,
      infix: InfixExprHandler | null, prec: Precedence): PrecedenceEntry {
      if (prefix) prefix = prefix.bind(parser);
      if (infix) infix = infix.bind(parser);

      return [prefix, infix, prec]
    }

    return {
      // [TokenTag.STRING]:     entry(parser.literals, null, Precedence.None),
      [TokenTag.CHAR]:       entry(parser.literals, null, Precedence.None),
      [TokenTag.INTEGER]:    entry(parser.literals, null, Precedence.None),
      [TokenTag.REAL]:       entry(parser.literals, null, Precedence.None),
      [TokenTag.TRUE]:       entry(parser.literals, null, Precedence.None),
      [TokenTag.FALSE]:      entry(parser.literals, null, Precedence.None),
      // TokenType.Identifier

      [TokenTag.LEFT_PAREN]: entry(parser.grouping, null, Precedence.Call),
      // TokenType.DOT

      [TokenTag.PLUS]:       entry(parser.unary, parser.binary, Precedence.Sums),
      [TokenTag.MINUS]:      entry(parser.unary, parser.binary, Precedence.Sums),
      [TokenTag.MULTIPLY]:   entry(null, parser.binary, Precedence.Products),
      [TokenTag.SLASH]:      entry(null, parser.binary, Precedence.Products),
      [TokenTag.DIV]:        entry(null, parser.binary, Precedence.Products),
      [TokenTag.MOD]:        entry(null, parser.binary, Precedence.Products),

      [TokenTag.EQUAL]:      entry(null, parser.binary, Precedence.Relational),
      [TokenTag.GREATER]:    entry(null, parser.binary, Precedence.Relational),
      [TokenTag.LESS]:       entry(null, parser.binary, Precedence.Relational),
      [TokenTag.GREATER_EQ]: entry(null, parser.binary, Precedence.Relational),
      [TokenTag.LESS_EQ]:    entry(null, parser.binary, Precedence.Relational),
      [TokenTag.NOT_EQ]:     entry(null, parser.binary, Precedence.Relational),

      [TokenTag.XOR]:        entry(null, parser.binary, Precedence.Sums),
      [TokenTag.SHL]:        entry(null, parser.binary, Precedence.Products),
      [TokenTag.SHR]:        entry(null, parser.binary, Precedence.Products),
      [TokenTag.NOT]:        entry(parser.unary, null, Precedence.Unary),
      // TokenType.AND & OR
    };
  }
}
