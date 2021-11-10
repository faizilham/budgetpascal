import { threadId } from "worker_threads";
import { ParserError, UnreachableErr } from "./errors";
import { BaseType, Expr, getTypeName, isNumberType as isNumberType, isTypeEqual, PascalType } from "./expression";
import { Scanner, Token, TokenType } from "./scanner";

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
type PrecedenceTable = {[key in TokenType]?: PrecedenceEntry};

export class Parser {
  scanner: Scanner;
  current: Token;
  previous: Token;
  precedenceRule: PrecedenceTable;

  constructor(public text: string) {
    this.scanner = new Scanner(text);
    this.current = this.scanner.eofToken(); // placeholder value
    this.previous = this.current;
    this.precedenceRule = buildPrecedence(this);
  }

  parse() {
    try {
      this.advance();
      return this.expression();
    } catch(e: any) {
      if (e instanceof ParserError) {
        this.errorAtCurrent(e.message);
      } else {
        console.error("Panic: ", e);
      }
    }
  }

  expression(): Expr {
    return this.parsePrecedence(Precedence.Relational);
  }

  parsePrecedence(precedence: Precedence): Expr {
    this.advance();

    const prefixRule = this.precedence(this.previous);

    if (!prefixRule || !prefixRule[0]) {
      throw new ParserError("Expect expression");
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

  unary(): Expr {
    const operator = this.previous;
    const operand = this.parsePrecedence(Precedence.Unary);

    // type check
    switch (operator.type) {
      case TokenType.PLUS: { //
        if (!isNumberType(operand.type)) {
          throw new ParserError(`Unknown operator '+' for type ${getTypeName(operand.type)}`);
        }
        return operand;
      }

      case TokenType.MINUS: {
        if (!isNumberType(operand.type)) {
          throw new ParserError(`Unknown operator '-' for type ${getTypeName(operand.type)}`);
        }
        break;
      }

      case TokenType.NOT: { // logic not and bitwise not
        if (!isTypeEqual(operand.type, BaseType.Boolean) &&
            !isTypeEqual(operand.type, BaseType.Integer)) {
          throw new ParserError(`Unknown operator 'not' for type ${getTypeName(operand.type)}`);
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

  binary(left: Expr): Expr {
    const operator = this.previous;
    const precedence = this.precedence(operator)[2];
    const right = this.parsePrecedence(precedence + 1);

    let exprType: PascalType = BaseType.Void;

    function errorOperandType(a?: PascalType, b?: PascalType) {
      const op = operator.lexeme;
      const nameA = getTypeName(a);
      const nameB = getTypeName(b);
      return new ParserError(`Unknown operator '${op}' for type ${nameA} and ${nameB}`);
    }

    switch(operator.type) {

      // math operators

      // (number, number) -> number
      case TokenType.PLUS:
        //TODO: string-string, string-char, char-char plus operator
        // fallthrough
      case TokenType.MINUS:
      case TokenType.MULTIPLY: {
        if (!isNumberType(left.type) || !isNumberType(right.type)) {
          throw errorOperandType(left.type, right.type);
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

      case TokenType.SLASH: { // (number, number) -> real
        if (!isNumberType(left.type) || !isNumberType(right.type)) {
          throw errorOperandType(left.type, right.type);
        }

        exprType = BaseType.Real;
        break;
      }

      case TokenType.DIV: // (int, int) -> int
      case TokenType.MOD:
      case TokenType.SHL:
      case TokenType.SHR: {
        if (!isTypeEqual(left.type, BaseType.Integer) ||
            !isTypeEqual(right.type, BaseType.Integer)) {
          throw errorOperandType(left.type, right.type);
        }

        exprType = BaseType.Integer;
        break;
      }

    //   TokenType.AND
    //   TokenType.OR
      case TokenType.XOR: {
        if (isTypeEqual(left.type, BaseType.Integer) &&
            isTypeEqual(right.type, BaseType.Integer)) {
          exprType = BaseType.Integer;
        } else if (isTypeEqual(left.type, BaseType.Boolean) &&
                   isTypeEqual(right.type, BaseType.Boolean)) {
          exprType = BaseType.Boolean
        } else {
          throw errorOperandType(left.type, right.type);
        }

        break;
      }

      case TokenType.EQUAL:
      case TokenType.GREATER:
      case TokenType.LESS:
      case TokenType.GREATER_EQ:
      case TokenType.LESS_EQ:
      case TokenType.NOT_EQ: {
        //TODO: char-char, string-string, and string-char comparison

        if (isNumberType(left.type) && isNumberType(right.type)) {
          exprType = BaseType.Boolean;
        } else {
          throw errorOperandType(left.type, right.type);
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

  literals(): Expr {
    const expr = new Expr.Literal(this.previous);
    return expr;
  }

  grouping(): Expr {
    const expr = this.expression();
    this.consume(TokenType.RIGHT_PAREN, "Expect ')' after expression");

    return expr;
  }

  // parser primitives

  private precedence(token: Token): PrecedenceEntry {
    return this.precedenceRule[token.type] || [null, null, Precedence.None];
  }

  private advance(): Token {
    this.previous = this.current;
    for (;;) {
      this.current = this.scanner.scanToken();

      if (this.current.type !== TokenType.UNKNOWN) break;

      this.errorAtCurrent(this.scanner.lastError);
    }

    return this.previous;
  }

  private check(type: TokenType): boolean {
    return this.current.type === type;
  }

  private match(type: TokenType): boolean {
    if (!this.check(type)) {
      return false;
    }

    this.advance();

    return true;
  }

  private consume(type: TokenType, errMessage: string) {
    if (!this.match(type)){
      this.errorAtCurrent(errMessage);
    }
  }

  private errorAtCurrent(message: string) {
    this.errorAt(this.current, message);
  }

  private errorAt(token: Token, message: string) {
    console.error(`Parser error on line ${token.line}: ${message}`);
  }
}

function buildPrecedence(parser: Parser): PrecedenceTable {
  function entry(prefix: PrefixExprHandler | null,
    infix: InfixExprHandler | null, prec: Precedence): PrecedenceEntry {
    if (prefix) prefix = prefix.bind(parser);
    if (infix) infix = infix.bind(parser);

    return [prefix, infix, prec]
  }

  return {
    [TokenType.STRING]:     entry(parser.literals, null, Precedence.None),
    [TokenType.CHAR]:       entry(parser.literals, null, Precedence.None),
    [TokenType.INTEGER]:    entry(parser.literals, null, Precedence.None),
    [TokenType.REAL]:       entry(parser.literals, null, Precedence.None),
    [TokenType.TRUE]:       entry(parser.literals, null, Precedence.None),
    [TokenType.FALSE]:      entry(parser.literals, null, Precedence.None),
    // TokenType.Identifier

    [TokenType.LEFT_PAREN]: entry(parser.grouping, null, Precedence.Call),
    // TokenType.DOT

    [TokenType.PLUS]:       entry(parser.unary, parser.binary, Precedence.Sums),
    [TokenType.MINUS]:      entry(parser.unary, parser.binary, Precedence.Sums),
    [TokenType.MULTIPLY]:   entry(null, parser.binary, Precedence.Products),
    [TokenType.SLASH]:      entry(null, parser.binary, Precedence.Products),
    [TokenType.DIV]:        entry(null, parser.binary, Precedence.Products),
    [TokenType.MOD]:        entry(null, parser.binary, Precedence.Products),

    [TokenType.EQUAL]:      entry(null, parser.binary, Precedence.Relational),
    [TokenType.GREATER]:    entry(null, parser.binary, Precedence.Relational),
    [TokenType.LESS]:       entry(null, parser.binary, Precedence.Relational),
    [TokenType.GREATER_EQ]: entry(null, parser.binary, Precedence.Relational),
    [TokenType.LESS_EQ]:    entry(null, parser.binary, Precedence.Relational),
    [TokenType.NOT_EQ]:     entry(null, parser.binary, Precedence.Relational),

    [TokenType.XOR]:        entry(null, parser.binary, Precedence.Sums),
    [TokenType.SHL]:        entry(null, parser.binary, Precedence.Products),
    [TokenType.SHR]:        entry(null, parser.binary, Precedence.Products),
    [TokenType.NOT]:        entry(parser.unary, null, Precedence.Unary),
    // TokenType.AND & OR
  };
}
