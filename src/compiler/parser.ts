import { Expr, PascalType } from "./expression";
import { Scanner, Token, TokenType } from "./scanner";

enum Precedence {
  None,
  Relational, // all relational operators
  Sums,       // + - or xor
  Products,   // * / div mod and shl shr
  Unary,      // not, unary +-, **
  Call,       // ( ) .
}

// PrecedenceEntry: <prefix function, infix function, precedence>
type PrefixExprHandler = (type?: PascalType)=>Expr;
type InfixExprHandler = ((left: Expr, type?: PascalType)=>Expr);
type PrecedenceEntry = [PrefixExprHandler | null, InfixExprHandler | null, Precedence];
type PrecedenceTable = {[key in TokenType]?: PrecedenceEntry};

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
    [TokenType.POW]:        entry(null, parser.binary, Precedence.Unary),

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
    this.advance();
    return this.expression();
  }

  expression(upperType?: PascalType): Expr {
    return this.parsePrecedence(Precedence.Relational, upperType);
  }

  parsePrecedence(precedence: Precedence, upperType?: PascalType): Expr {
    this.advance();

    const prefixRule = this.precedence(this.previous);

    if (!prefixRule || !prefixRule[0]) {
      throw new ParserError("Expect expression");
    }

    let lefthand = prefixRule[0](upperType);

    let currentRule = this.precedence(this.current);

    while (precedence <= currentRule[2]) {
      this.advance();
      const infixRule = currentRule[1] as InfixExprHandler;
      lefthand = infixRule(lefthand, upperType);

      currentRule = this.precedence(this.current);
    }

    return lefthand;
  }

  unary(upperType?: PascalType): Expr {
    const operator = this.previous;
    const operand = this.parsePrecedence(Precedence.Unary);

    const expr = new Expr.Unary(operator, operand);
    expr.type = operand.type;

    // TODO: typecheck?

    return expr;
  }

  binary(left: Expr, upperType?: PascalType): Expr {
    const operator = this.previous;
    const precedence = this.precedence(operator)[2];
    const right = this.parsePrecedence(precedence + 1, upperType);

    if (left.type !== right.type) {
      // TODO: typecheck
    }

    const expr = new Expr.Binary(operator, left, right);
    expr.type = left.type;

    if (upperType != null && expr.type != upperType) {
      // TODO: typecheck
    }

    return expr;
  }

  literals(upperType?: PascalType): Expr {
    const expr = new Expr.Literal(this.previous);

    if (upperType != null && upperType !== expr.type) {
      // TODO: typecheck
    }

    return expr;
  }

  grouping(upperType?: PascalType): Expr {
    const expr = this.expression(upperType);
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

class ParserError extends Error {
  constructor(message: string) { super(message); }
}
