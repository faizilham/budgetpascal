import { threadId } from "worker_threads";
import { ErrLogger, ParserError, UnreachableErr } from "./errors";
import { BaseType, Expr, getTypeName, isBool, isNumberType as isNumberType, isTypeEqual, PascalType } from "./expression";
import { Decl, IdentifierType, Program, Routine, Stmt } from "./routine";
import { Scanner, Token, TokenTag } from "./scanner";

export class Parser {
  scanner: Scanner;
  current: Token;
  previous: Token;
  precedenceRule: PrecedenceTable;
  hasError: boolean;
  currentRoutine: Routine;
  logger: ErrLogger.Reporter;

  constructor(public text: string, logger?: ErrLogger.Reporter) {
    this.precedenceRule = this.buildPrecedence();

    this.scanner = new Scanner(text);
    this.current = this.scanner.eofToken(); // placeholder value
    this.previous = this.current;
    this.hasError = false;
    this.currentRoutine = new Program("");
    this.logger = logger || ErrLogger.logger;
  }

  parse(): Program | undefined  {
    try {
      this.advance();
      const program = this.currentRoutine as Program;

      this.buildProgram(program);
      if (this.hasError) return;

      return program;
    } catch(e: any) {
      if (e instanceof ParserError) {
        this.reportError(e)
      } else {
        this.logger.error("Panic: ", e);
      }
    }
  }

  private buildProgram(program: Program) {
    this.consume(TokenTag.PROGRAM, "Expect 'program'.");
    this.consume(TokenTag.IDENTIFIER, "Expect identifier program name.");
    program.name = this.previous.lexeme;
    this.consume(TokenTag.SEMICOLON, "Expect ';' after program name.");

    this.declarations();

    program.body = this.compound();
    this.consume(TokenTag.DOT, "Expect '.' after end.");
  }

  /** Declarations **/
  private declarations() {
    while(!this.check(TokenTag.BEGIN)) {
      switch(this.current.tag) {
        case TokenTag.CONST: this.constPart(); break;
        case TokenTag.VAR: this.varPart(); break;
        default:
          throw this.errorAtCurrent(`Unknown declaration ${this.current.lexeme}`);
      }
      // TODO: sync declaration errors
    }
  }

  private constPart() {
    this.advance();
    do {
      try {
        this.constDeclaration();
      } catch (e: any) {
        if (e instanceof ParserError) {
          this.reportError(e);
          this.synchronizeVarConst();
        } else {
          throw e;
        }
      }
    } while (this.check(TokenTag.IDENTIFIER));
  }

  private constDeclaration() {
    this.consume(TokenTag.IDENTIFIER, "Expect identifier.");
    const name = this.previous;
    this.consume(TokenTag.EQUAL, "Expect '=' after identifer.");

    let value;
    switch(this.current.tag) {
      // TODO: case STRING
      case TokenTag.CHAR:
      case TokenTag.INTEGER:
      case TokenTag.REAL:
      case TokenTag.TRUE:
      case TokenTag.FALSE:
        value = this.advance();
      break;
      default:
        throw this.errorAtCurrent("Expect literal value after '='.");
    }

    this.consume(TokenTag.SEMICOLON, "Expect ';' after value.");
    const result = this.currentRoutine.identifiers.addConst(name.lexeme, value);
    if (!result) {
      throw this.errorAt(name, `Identifier '${name.lexeme}' is already declared in this scope.`);
    }
  }

  private varPart() {
    this.advance();
    do {
      try {
        this.varDeclaration();
      } catch (e: any) {
        if (e instanceof ParserError) {
          this.reportError(e);
          this.synchronizeVarConst();
        } else {
          throw e;
        }
      }
    } while (this.check(TokenTag.IDENTIFIER));
  }

  private varDeclaration() {
    const names: Token[] = [];
    do {
      this.consume(TokenTag.IDENTIFIER, "Expect identifier.");
      names.push(this.previous);
      if (!this.match(TokenTag.COMMA)) break;
    } while (this.check(TokenTag.IDENTIFIER));

    this.consume(TokenTag.COLON, "Expect ':' after variable name.");
    this.consume(TokenTag.IDENTIFIER, "Expect type name.");
    const typeName = this.previous.lexeme;

    this.consume(TokenTag.SEMICOLON, "Expect ';' after declaration.");

    const type = this.currentRoutine.findType(typeName);
    if (type == null) {
      throw this.errorAtCurrent(`Unknown type '${typeName}'.`);
    }

    for (let name of names) {
      const entry = this.currentRoutine.identifiers.addVariable(name.lexeme, type);
      if (!entry) {
        this.reportError(
          this.errorAt(name, `Identifier '${name.lexeme}' is already declared in this scope.`)
        );
        continue;
      }
      this.currentRoutine.declarations.push(new Decl.Variable(entry));
    }
  }

  private synchronizeVarConst() {
    while(this.current.tag !== TokenTag.EOF) {
      if (this.previous.tag === TokenTag.SEMICOLON) return;

      switch(this.current.tag) {
        case TokenTag.IDENTIFIER:
        case TokenTag.VAR:
        case TokenTag.CONST:
        case TokenTag.PROCEDURE:
        case TokenTag.FUNCTION:
        case TokenTag.TYPE:
        case TokenTag.BEGIN:
          return;
        default:
          this.advance();
      }
    }
  }

  /** Statement **/
  private statement(): Stmt {
    switch(this.current.tag) {
      case TokenTag.BEGIN: return this.compound();
      case TokenTag.IF: return this.ifElse();

      case TokenTag.WRITE:
      case TokenTag.WRITELN:
        return this.writeStmt();

      case TokenTag.IDENTIFIER:
        return this.identifierStmt();

      default:
        // TODO: defaulted to ?
        throw this.errorAtCurrent("Expect statement");
    }
  }

  private synchronizeStatement() {
    while(this.current.tag !== TokenTag.EOF) {
      if (this.previous.tag === TokenTag.SEMICOLON) return;

      switch(this.current.tag) {
        case TokenTag.IF:
        case TokenTag.CASE:
        case TokenTag.FOR:
        case TokenTag.WHILE:
        case TokenTag.REPEAT:
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

  private ifElse(): Stmt {
    this.advance();
    const conditionStart = this.current;
    const condition = this.expression();

    if (condition.type !== BaseType.Boolean) {
      throw this.errorAt(conditionStart,
        `Condition type must be boolean instead of ${getTypeName(condition.type)}`);
    }

    this.consume(TokenTag.THEN, "Expect 'then' after condition");

    let body;
    if (!this.check(TokenTag.ELSE)){
      body = this.statement();
    }

    let elseBody;
    if (this.match(TokenTag.ELSE)) {
      elseBody = this.statement();
    }

    return new Stmt.IfElse(condition, body, elseBody);
  }

  private writeStmt(): Stmt {
    this.advance();
    const newline = this.previous.tag === TokenTag.WRITELN;
    const outputs: Expr[] = [];

    if (this.match(TokenTag.LEFT_PAREN)) {
      if (!this.check(TokenTag.RIGHT_PAREN)) {
        do {
          const exprStart = this.current;
          const expr = this.expression();

          if (!this.isPrintable(expr.type)) {
            throw this.errorAt(exprStart, `Can't write type ${getTypeName(expr.type)} to console`);
          }
          outputs.push(expr);
        } while (this.match(TokenTag.COMMA));
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

  private identifierStmt(): Stmt {
    const expr = this.expression();

    const modifyToken = (tag: TokenTag) => {
      const modifier = this.current.copy();
      modifier.tag = tag;
      return modifier;
    }

    switch(this.current.tag) {
      case TokenTag.ASSIGN_PLUS:
        return this.assignment(expr, modifyToken(TokenTag.PLUS));
      case TokenTag.ASSIGN_MIN:
        return this.assignment(expr, modifyToken(TokenTag.MINUS));
      case TokenTag.ASSIGN_MUL:
        return this.assignment(expr, modifyToken(TokenTag.MULTIPLY));
      case TokenTag.ASSIGN_SLASH:
        return this.assignment(expr, modifyToken(TokenTag.SLASH));
      case TokenTag.ASSIGN:
        return this.assignment(expr);

    }

    throw this.errorAtCurrent("Expect assignment or procedure call");
  }

  private assignment(left: Expr, modifier?: Token) : Stmt {
    if (!left.assignable) {
      throw this.errorAtCurrent("Expect variable or array member.");
    }

    const operator = this.advance();
    let right = this.expression();
    if (modifier) {
      right = this.binary(left, modifier, right);
    }

    // Type check;
    if (!isTypeEqual(left.type, right.type)) {
      // the only valid implicit typecast is integer to real
      if (left.type !== BaseType.Real || right.type !== BaseType.Integer) {
        throw this.errorAt(operator,
          `Can't assign value of type ${getTypeName(right.type)} to ${getTypeName(left.type)}`);
      }
    }

    const target = left as Expr.Variable;

    return new Stmt.SetVariable(target, right);
  }

  /** Expression Parsing **/

  private expression(): Expr {
    return this.parsePrecedence(Precedence.Relational);
  }

  private variable(): Expr {
    const varToken = this.previous;

    const entry = this.currentRoutine.findIdentifier(varToken.lexeme);
    if (!entry) throw this.errorAtPrevious(`Unknown identifier '${varToken.lexeme}'.`);

    switch(entry.entryType) {
      case IdentifierType.Constant: return this.literals(entry.value);
      case IdentifierType.Variable: {
        return new Expr.Variable(entry);
      };
      default:
        throw new UnreachableErr(`Unknown identifier type for ${entry}`);
    }
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

  private binary(left: Expr, _operator?: Token, _right?: Expr): Expr {
    const operator = _operator || this.previous;
    const precedence = this.precedence(operator)[2];
    const right = _right || this.parsePrecedence(precedence + 1);

    let exprType: PascalType = BaseType.Void;

    const errorOperandType = () => {
      const op = operator.lexeme;
      const ltype = getTypeName(left.type);
      const rtype = getTypeName(right.type);
      return this.errorAt(operator, `Unknown operator '${op}' for type ${ltype} and ${rtype}`);
    }

    // Type check
    switch(operator.tag) {

      /* Math & Logic Operators */

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

      case TokenTag.AND:
      case TokenTag.OR: {
        if (isTypeEqual(left.type, BaseType.Integer) &&
            isTypeEqual(right.type, BaseType.Integer)) {
          exprType = BaseType.Integer;
        } else if (isBool(left.type) && isBool(right.type)) {
          return new Expr.ShortCircuit(operator, left, right);
        } else {
          throw errorOperandType();
        }

        break;
      }

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

      /* Comparators */
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

  private literals(constant?: Token): Expr {
    const expr = new Expr.Literal(constant || this.previous);
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
    this.logger.error(`Error on line ${err.token.line} col ${err.token.column}: ${err.message}`);
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
      [TokenTag.IDENTIFIER]: entry(parser.variable, null, Precedence.None),

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

      [TokenTag.AND]:        entry(null, parser.binary, Precedence.Products),
      [TokenTag.OR]:         entry(null, parser.binary, Precedence.Sums),
      [TokenTag.XOR]:        entry(null, parser.binary, Precedence.Sums),
      [TokenTag.SHL]:        entry(null, parser.binary, Precedence.Products),
      [TokenTag.SHR]:        entry(null, parser.binary, Precedence.Products),
      [TokenTag.NOT]:        entry(parser.unary, null, Precedence.Unary),
    };
  }
}

/* Precedence Types */

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
