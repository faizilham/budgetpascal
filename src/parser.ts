import { ErrLogger, ParserError, UnreachableErr } from "./errors";
import { Expr, Stmt, WriteFormat } from "./ast";
import { ArrayType, BaseType, getTypeName, isBool, isMemoryType, isNumberType, isOrdinal, isPointer, isPointerTo, isRecord, isString, isStringLike, isTypeEqual, PascalType, Pointer, RecordType, StringType } from "./types"
import { IdentifierType, ParamType, Program, Routine, StringTable, Subroutine, VariableEntry, VariableLevel } from "./routine";
import { Scanner, Token, TokenTag } from "./scanner";
import { LibraryFunction, Runtime } from "./runtime";

type VarDeclarationPairs = [Token[], PascalType];
type ParamDeclarationTuple = [Token[], PascalType, ParamType];

export class Parser {
  scanner: Scanner;
  current: Token;
  previous: Token;
  precedenceRule: PrecedenceTable;
  hasError: boolean;
  currentRoutine: Routine;
  logger: ErrLogger.Reporter;
  loopLevel: number;
  stringLiterals: StringTable;
  functionId: number;
  libraryUsed: string[];

  constructor(public text: string, logger?: ErrLogger.Reporter) {
    this.precedenceRule = this.buildPrecedence();

    this.scanner = new Scanner(text);
    this.current = this.scanner.eofToken(); // placeholder value
    this.previous = this.current;
    this.hasError = false;
    this.currentRoutine = new Program("");
    this.logger = logger || ErrLogger.logger;
    this.loopLevel = 0;
    this.functionId = 1;
    this.stringLiterals = new Map();
    this.libraryUsed = ["rtl"];
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

    program.stringTable = this.stringLiterals;
  }

  /** Declarations **/
  private declarations() {
    while(!this.check(TokenTag.BEGIN)) {
      switch(this.current.tag) {
        case TokenTag.CONST: this.constPart(); break;
        case TokenTag.VAR: this.varPart(); break;
        case TokenTag.TYPE: this.typeDefPart(); break;

        case TokenTag.PROCEDURE:
        case TokenTag.FUNCTION:
          this.subroutineDeclaration(); break;

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

    const allowedValues = [TokenTag.CHAR, TokenTag.INTEGER, TokenTag.REAL,
      TokenTag.TRUE, TokenTag.FALSE, TokenTag.STRING];

    this.consumeAny(allowedValues, "Expect literal value after '='.");
    let value = this.previous;

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
        const [names, type] = this.varDeclaration();
        this.consume(TokenTag.SEMICOLON, "Expect ';' after declaration.");

        for (let name of names) {
          const entry = this.currentRoutine.identifiers.addVariable(name.lexeme, type, this.currentRoutine.id);

          if (!entry) {
            this.reportError(
              this.errorAt(name, `Identifier '${name.lexeme}' is already declared in this scope.`)
            );
          }
        }
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

  private varDeclaration(simpleTypesOnly = false): VarDeclarationPairs {
    const names: Token[] = [];
    do {
      this.consume(TokenTag.IDENTIFIER, "Expect identifier.");
      names.push(this.previous);
      if (!this.match(TokenTag.COMMA)) break;
    } while (this.check(TokenTag.IDENTIFIER));

    this.consume(TokenTag.COLON, "Expect ':' after variable name.");
    const type = this.typeName(simpleTypesOnly);

    return [names, type];
  }

  private typeName(identiferOnly = false): PascalType {
    this.consumeAny([TokenTag.IDENTIFIER, TokenTag.STRING_TYPE, TokenTag.ARRAY, TokenTag.RECORD],
      "Expect type name.");
    const typeName = this.previous;

    let type: PascalType | null = null;
    if (!identiferOnly) {
      switch(typeName.tag) {
        case TokenTag.STRING_TYPE: type = this.stringType(); break;
        case TokenTag.ARRAY: type = this.arrayType(); break;
        case TokenTag.RECORD: type = this.recordType(); break;
      }
    }

    if (type == null) {
      type = this.currentRoutine.findType(typeName.lexeme);
      if (type == null) {
        throw this.errorAt(typeName, `Unknown type '${typeName.lexeme}'.`);
      }
    }

    return type;
  }

  private stringType(): StringType {
    let length = 255;

    if (this.match(TokenTag.LEFT_SQUARE)) {
      this.consume(TokenTag.INTEGER, "Expect string length");
      let intLiteral = this.previous;
      length = intLiteral.literal as number;
      this.consume(TokenTag.RIGHT_SQUARE, "Expect ']'.");

      if (length > 255) {
        throw this.errorAt(intLiteral, "String size can't be larger than 255.");
      }
    }

    return StringType.create(length);
  }

  private arrayType(): PascalType {
    this.consume(TokenTag.LEFT_SQUARE, "Expect '['.");

    const dimensions: [number, number][] = [];

    do {
      const startToken = this.consume(TokenTag.INTEGER, "Expect integer starting index.");
      this.consume(TokenTag.RANGE, "Expect '..' after starting index.");
      const endToken = this.consume(TokenTag.INTEGER, "Expect integer final index.");

      const start = startToken.literal as number;
      const end = endToken.literal as number;

      if (start >= end) {
        throw this.errorAt(startToken, "Starting index must be smaller than final index.");
      }

      dimensions.push([start, end]);
    } while(!this.check(TokenTag.RIGHT_SQUARE) && this.match(TokenTag.COMMA));

    this.consume(TokenTag.RIGHT_SQUARE, "Expect ']'.");

    this.consume(TokenTag.OF, "Expect 'of'.");

    let type = this.typeName();

    for (let i = dimensions.length - 1; i >= 0; i--) {
      const [start, end] = dimensions[i];
      type = new ArrayType(start, end, type);
    }

    return type;
  }

  private recordType(): RecordType {
    let record = new RecordType();
    do {
      const [names, type] = this.varDeclaration();

      for (let name of names) {
        if (!record.addField(name.lexeme, type)) {
          throw this.errorAt(name, `Field ${name.lexeme} already exists for this record.`);
        }
      }

      this.consume(TokenTag.SEMICOLON, "Expect ';' after field declaration.");

    } while (!this.check(TokenTag.END) && !this.check(TokenTag.EOF));

    this.consume(TokenTag.END, "Expect 'end' after record fields.");

    return record;
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

  private typeDefPart() {
    this.advance();
    do {
      try {
        this.typeDefinition();
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

  private typeDefinition() {
    this.consume(TokenTag.IDENTIFIER, "Expect identifier.");
    const name = this.previous;
    this.consume(TokenTag.EQUAL, "Expect '=' after identifer.");

    const type = this.typeName();

    this.consume(TokenTag.SEMICOLON, "Expect ';' after value.");
    const result = this.currentRoutine.identifiers.addType(name.lexeme, type);
    if (!result) {
      throw this.errorAt(name, `Identifier '${name.lexeme}' is already declared in this scope.`);
    }

    if (type instanceof RecordType) {
      type.name = name.lexeme;
    }
  }

  private subroutineDeclaration() {
    const subroutineKind = this.advance();
    const isFunction = subroutineKind.tag === TokenTag.FUNCTION;
    const kindName = isFunction ? "function" : "procedure";

    this.consume(TokenTag.IDENTIFIER, `Expect ${kindName} name.`);
    const name = this.previous;
    const params = this.paramsDecl();

    let returnType: PascalType = BaseType.Void;
    if (isFunction) {
      this.consume(TokenTag.COLON, "Expect ':'.");
      returnType = this.typeName(true);
    }

    this.consume(TokenTag.SEMICOLON, `Expect ';' after ${kindName} declaration.`);

    const parent = this.currentRoutine;
    const id = this.functionId++;
    const subroutine = new Subroutine(id, name.lexeme, returnType, parent);

    if (!parent.identifiers.addSubroutine(subroutine)) {
      throw this.errorAt(name, `Identifier '${name.lexeme}' is already declared in this scope.`);
    }

    for (const [paramNames, type, paramType] of params) {
      for (const paramName of paramNames) {
        const entry = subroutine.addParam(paramName.lexeme, type, paramType);
        if (!entry) {
          throw this.errorAt(paramName, `Identifier '${paramName.lexeme}' is already declared in this scope.`);
        }
      }
    }

    try {
      this.currentRoutine = subroutine;
      this.declarations();
      subroutine.body = this.compound();
      this.consume(TokenTag.SEMICOLON, "Expect ';' after end.");
    } finally {
      this.currentRoutine = parent;
    }
  }

  private paramsDecl(): ParamDeclarationTuple[] {
    const params: ParamDeclarationTuple[] = [];
    if (this.match(TokenTag.LEFT_PAREN)) {
      if (!this.check(TokenTag.RIGHT_PAREN)) {
        do {
          let paramType = ParamType.VALUE;
          if (this.match(TokenTag.CONST)) {
            paramType = ParamType.CONST;
          } else if (this.match(TokenTag.VAR)) {
            paramType = ParamType.REF;
          }

          let [names, type] = this.varDeclaration(true);

          if ((paramType === ParamType.REF) || (paramType === ParamType.CONST && isMemoryType(type))) {
            type = new Pointer(type);
          }

          params.push([names, type, paramType]);
        } while(!this.check(TokenTag.RIGHT_PAREN) && this.match(TokenTag.SEMICOLON));
      }

      this.consume(TokenTag.RIGHT_PAREN, "Expect ')'");
    }

    return params;
  }

  private reserveTempVariable(type: PascalType): VariableEntry {
    const entry = this.currentRoutine.identifiers.getTempVariable(type, this.currentRoutine.id);
    entry.reserved = true;
    entry.usedCount++;
    return entry;
  }

  private releaseTempVariable(entry: VariableEntry, unused = false) {
    entry.reserved = false;
    if (unused) {
      entry.usedCount--;
    }
  }

  /** Statement **/
  private statement(): Stmt {
    let result;
    switch(this.current.tag) {
      case TokenTag.BEGIN: result = this.compound(); break;

      case TokenTag.BREAK:
      case TokenTag.CONTINUE:
        result = this.loopControl();
      break;

      case TokenTag.CASE: result = this.caseStmt(); break;
      case TokenTag.FOR: result = this.forLoop(); break;
      case TokenTag.IF: result = this.ifElse(); break;
      case TokenTag.REPEAT: result = this.repeatUntil(); break;
      case TokenTag.WHILE: result = this.whileDo(); break;

      case TokenTag.READ:
      case TokenTag.READLN:
        result = this.readStmt();
      break;

      case TokenTag.WRITE:
      case TokenTag.WRITELN:
        result = this.writeStmt();
      break;

      case TokenTag.IDENTIFIER: result = this.identifierStmt(); break;

      default:
        throw this.errorAtCurrent("Expect statement");
    }

    this.match(TokenTag.SEMICOLON);

    return result;
  }

  private synchronizeStatement() {
    while(this.current.tag !== TokenTag.EOF) {
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
        case TokenTag.BREAK:
        case TokenTag.CONTINUE:
          return;
        default:
          this.advance();
      }

      if (this.previous.tag === TokenTag.SEMICOLON) return;
    }
  }

  private compound(): Stmt.Compound {
    this.consume(TokenTag.BEGIN, "Expect 'begin'.");

    const statements: Stmt[] = [];

    while (!this.check(TokenTag.EOF) && !this.check(TokenTag.END)) {
      try {
        statements.push(this.statement());

        if (!this.check(TokenTag.EOF) && !this.check(TokenTag.END) &&
            this.previous.tag !== TokenTag.SEMICOLON) {
           throw this.errorAtCurrent("Expect ';' between statements.");
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

  private caseStmt(): Stmt {
    this.advance();
    const exprStart = this.current;
    const checkValue = this.expression();
    this.consume(TokenTag.OF, "Expect 'of' after expression.");
    const type = checkValue.type as PascalType;

    if (!isOrdinal(type)) {
      throw this.errorAt(exprStart, "Expect expression with ordinal type.");
    }

    const tempVarEntry = this.reserveTempVariable(type);
    const tempVar = new Expr.Variable(tempVarEntry);

    let initVarStmt = new Stmt.SetVariable(tempVar, checkValue);
    let root: Stmt.IfElse | null = null;
    let lastParent: Stmt.IfElse | null = null;

    do {
      const beforeCase = this.previous;
      const casePart = this.caseMatch(tempVar);
      if (!lastParent) {
        lastParent = casePart;
        root = casePart;
      } else {
        if (beforeCase.tag !== TokenTag.SEMICOLON) {
          throw this.errorAt(beforeCase, "Expect ';' between case bodies");
        }
        lastParent.elseBody = casePart;
        lastParent = casePart;
      }
    } while (!this.check(TokenTag.ELSE) && !this.check(TokenTag.END) && !this.check(TokenTag.EOF));

    const beforeElse = this.previous;

    if (this.match(TokenTag.ELSE)) {
      if (beforeElse.tag === TokenTag.SEMICOLON) {
        throw this.errorAt(beforeElse, "Semicolons are not allowed before 'else'.");
      }

      const statements = [];
      while(!this.check(TokenTag.END) && !this.check(TokenTag.EOF)) {
        statements.push(this.statement());

        if (!this.check(TokenTag.EOF) && !this.check(TokenTag.END) &&
            this.previous.tag !== TokenTag.SEMICOLON) {
           throw this.errorAtCurrent("Expect ';' between statements.");
        }
      }
      const compound = new Stmt.Compound(statements);
      (lastParent as Stmt.IfElse).elseBody = compound;
    }

    this.consume(TokenTag.END, "Expect 'end' after case statement.");
    this.releaseTempVariable(tempVarEntry);

    return new Stmt.Compound([
      initVarStmt,
      root as Stmt.IfElse
    ]);
  }

  private caseMatch(tempVar: Expr.Variable): Stmt.IfElse {
    let caseCondition;
    do {
      let matchExpr = this.caseMatchCondition(tempVar);
      if (!caseCondition) {
        caseCondition = matchExpr;
      } else {
        // use the comma token as if it was an OR
        const orOperator = this.previous.copy();
        orOperator.tag = TokenTag.OR;
        caseCondition = this.binary(caseCondition, orOperator, matchExpr);
      }
    } while(this.match(TokenTag.COMMA));

    this.consume(TokenTag.COLON, "Expect ':'.");
    const branchStmt = this.statement();

    return new Stmt.IfElse(caseCondition, branchStmt);
  }

  private caseMatchCondition(tempVar: Expr.Variable): Expr {
    const allowedValues = [TokenTag.CHAR, TokenTag.INTEGER, TokenTag.TRUE, TokenTag.FALSE];

    this.consumeAny(allowedValues, "Expect ordinal literal value.");
    let startToken = this.previous;
    let startVal = this.literals(startToken);

    if (!this.match(TokenTag.RANGE)) {
      const operator = new Token(TokenTag.EQUAL, "=", startToken.line, startToken.column);
      return this.binary(tempVar, operator, startVal)
    }

    if (!isOrdinal(startVal.type)) {
      throw this.errorAtPrevious("Invalid range expression.");
    }

    this.consumeAny(allowedValues, "Expect literal value after '..'.");
    let endToken = this.previous;
    let endVal = this.literals(endToken);

    if (!isTypeEqual(startVal.type, endVal.type)) {
      throw this.errorAtPrevious("Invalid range expression.");
    }

    let operator = new Token(TokenTag.LESS_EQ, "<=", startToken.line, startToken.column);
    const startCheck = this.binary(startVal, operator, tempVar);
    const endCheck = this.binary(tempVar, operator, endVal);

    operator = new Token(TokenTag.AND, "and", startToken.line, startToken.column);
    return this.binary(startCheck, operator, endCheck);
  }

  private forLoop(): Stmt {
    this.advance();
    this.advance(); // variable() reads from previous

    const iterator = this.variable();

    if (!(iterator instanceof Expr.Variable)) {
      throw this.errorAtPrevious(`Expect local or global variable in a for loop.`);
    } else if (iterator.entry.level === VariableLevel.UPPER && iterator.entry.ownerId !== 0) {
      throw this.errorAtPrevious(`Expect local or global variable in a for loop.`);
    } else if (!isOrdinal(iterator.type)) {
      throw this.errorAtPrevious("Expect variable with ordinal type.");
    } else if (!iterator.assignable) {
      throw this.errorAtCurrent("Expect assignable variable.");
    }

    const initializations = [];

    // parse initial value expression
    this.consume(TokenTag.ASSIGN, "Expect ':=' after variable.")

    let lastToken = this.current;
    const initVal = this.expression();

    if (!isTypeEqual(iterator.type, initVal.type)) {
      throw this.errorAt(lastToken, "Mismatch type between iterator variable and initial value.");
    }

    // generate iterator := initVal
    initializations.push(new Stmt.SetVariable(iterator, initVal));

    // parse final value expression
    if (!this.match(TokenTag.TO) && !this.match(TokenTag.DOWNTO)) {
      throw this.errorAtCurrent("Expect 'to' or 'downto' after initialization.");
    }
    const steppingToken = this.previous; // save to / downto token
    const ascending = steppingToken.tag === TokenTag.TO;

    lastToken = this.current;
    const finalValue = this.expression();

    if (!isTypeEqual(iterator.type, finalValue.type)) {
      throw this.errorAt(lastToken, "Mismatch type between iterator variable and final value.");
    }

    const tempvar = this.reserveTempVariable(iterator.type as PascalType);
    const finalVariable = new Expr.Variable(tempvar);

    // generate finalVariable := finalValue
    initializations.push(new Stmt.SetVariable(finalVariable, finalValue));

    this.consume(TokenTag.DO, "Expect 'do' after final value.")

    let conditionOperator;

    if (ascending) {
      conditionOperator = new Token(TokenTag.LESS_EQ, "<=",
        steppingToken.line, steppingToken.column);
    } else {
      conditionOperator = new Token(TokenTag.GREATER_EQ, ">=",
        steppingToken.line, steppingToken.column);
    }

    const condition = this.binary(iterator, conditionOperator, finalVariable);

    // start 1 place before start value, as increment will be done before condition check
    initializations.push(new Stmt.Increment(iterator, !ascending));
    const increment = new Stmt.Increment(iterator, ascending)

    const iteratorEntry = iterator.entry;
    const immutability = iteratorEntry.immutable;
    try {
      this.loopLevel++;
      iteratorEntry.immutable = true;
      const body = this.statement();
      return new Stmt.ForLoop(initializations, condition, increment, body);
    } finally {
      iteratorEntry.immutable = immutability;
      this.releaseTempVariable(tempvar)
      this.loopLevel--;
    }
  }

  private ifElse(): Stmt {
    this.advance();
    const conditionStart = this.current;
    const condition = this.expression();

    if (condition.type !== BaseType.Boolean) {
      throw this.errorAt(conditionStart,
        `Condition type must be boolean instead of ${getTypeName(condition.type)}`);
    }

    this.consume(TokenTag.THEN, "Expect 'then' after condition.");

    let body;
    if (!this.check(TokenTag.ELSE)){
      body = this.statement();
    }

    let beforeElse = this.previous;

    let elseBody;
    if (this.match(TokenTag.ELSE)) {
      if (beforeElse.tag === TokenTag.SEMICOLON) {
        throw this.errorAt(beforeElse, "Semicolons are not allowed before 'else'.");
      }

      elseBody = this.statement();
    }

    if (!body && !elseBody) {
      throw this.errorAtCurrent("Expect statement in if statement.");
    }

    return new Stmt.IfElse(condition, body, elseBody);
  }

  private loopControl(): Stmt {
    const token = this.advance();
    if (this.loopLevel === 0) {
      throw this.errorAtPrevious(`Can't use statement '${token.lexeme}' outside of loop`);
    }

    return new Stmt.LoopControl(token);
  }

  private readStmt(): Stmt {
    this.advance();
    const newline = this.previous.tag === TokenTag.READLN;
    const targets: Expr[] = [];

    if (this.match(TokenTag.LEFT_PAREN)){
      if (!this.check(TokenTag.RIGHT_PAREN)) {
        do {
          const exprStart = this.current;
          let expr = this.expression();
          const readType = expr.type;
          expr = this.removeDeref(expr);

          if (!expr.assignable || (!isPointer(expr.type) && !(expr instanceof Expr.Variable))) {
            throw this.errorAt(exprStart, "Expect assignable variable, array element or record field.");
          }

          if (!this.isReadable(readType)) {
            throw this.errorAt(exprStart, `Can't read type ${getTypeName(readType)} from console`);
          }

          targets.push(expr);
        } while (this.match(TokenTag.COMMA));
      }

      this.consume(TokenTag.RIGHT_PAREN, "Expect ')'.");
    }

    return new Stmt.Read(targets, newline);
  }

  private isReadable(type?: PascalType) {
    if (!type) return false;

    return isString(type) || type === BaseType.Char || type === BaseType.Integer ||
      type === BaseType.Real;
  }

  private repeatUntil(): Stmt {
    this.advance();

    const statements = [];
    while(!this.check(TokenTag.UNTIL) && !this.check(TokenTag.EOF)) {
      statements.push(this.statement());

      if (!this.check(TokenTag.UNTIL) && !this.check(TokenTag.END) &&
          this.previous.tag !== TokenTag.SEMICOLON) {
         throw this.errorAtCurrent("Expect ';' between statements.");
      }
    }

    this.consume(TokenTag.UNTIL, "Expect 'until'.");
    const finishCondition = this.expression();

    return new Stmt.RepeatUntil(finishCondition, statements);
  }

  private whileDo(): Stmt {
    this.advance();
    const conditionStart = this.current;
    const condition = this.expression();

    if (condition.type !== BaseType.Boolean) {
      throw this.errorAt(conditionStart,
        `Condition type must be boolean instead of ${getTypeName(condition.type)}`);
    }

    this.consume(TokenTag.DO, "Expect 'do' after condition.");

    try {
      this.loopLevel++;
      const body = this.statement();
      return new Stmt.WhileDo(condition, body);
    } finally {
      this.loopLevel--;
    }
  }

  private writeStmt(): Stmt {
    this.advance();
    const newline = this.previous.tag === TokenTag.WRITELN;
    const outputs: Expr[] = [];
    const formats: WriteFormat[] = [];

    if (this.match(TokenTag.LEFT_PAREN)) {
      if (!this.check(TokenTag.RIGHT_PAREN)) {
        do {
          const exprStart = this.current;
          const expr = this.expression();

          if (!this.isPrintable(expr.type)) {
            throw this.errorAt(exprStart, `Can't write type ${getTypeName(expr.type)} to console`);
          }

          let format = this.writeFormat(expr.type);

          outputs.push(expr);
          formats.push(format);
        } while (this.match(TokenTag.COMMA));
      }

      this.consume(TokenTag.RIGHT_PAREN, "Expect ')' after expression.");
    }

    return new Stmt.Write(outputs, newline, formats);
  }

  private writeFormat(printType?: PascalType): WriteFormat {
    let format: WriteFormat = {spacing: null, decimal: null};

    if (this.match(TokenTag.COLON)) {
      let start = this.current;
      format.spacing = this.expression();
      if (format.spacing.type !== BaseType.Integer) {
        throw this.errorAt(start, `Incompatible type: expected ${getTypeName(BaseType.Integer)}, got ${getTypeName(format.spacing.type)}.`);
      }

      if (this.match(TokenTag.COLON)) {
        if (printType !== BaseType.Real) {
          throw this.errorAtPrevious(`Illegal use of ':'.`);
        }

        start = this.current;
        format.decimal = this.expression();

        if (format.decimal.type !== BaseType.Integer) {
          throw this.errorAt(start, `Incompatible type: expected ${getTypeName(BaseType.Integer)}, got ${getTypeName(format.decimal.type)}.`);
        }
      }
    }

    return format;
  }

  private isPrintable(type?: PascalType): boolean {
    if (!type) return false;

    return isString(type) || type === BaseType.Boolean || type === BaseType.Char ||
      type === BaseType.Integer || type === BaseType.Real;
  }

  private identifierStmt(): Stmt {
    let expr;

    // handle call statement
    let tempVar = this.reserveTempVariable(BaseType.Integer);
    let tempNotUsed = true;
    try {
      expr = this.expression();

      if (expr instanceof Expr.Call || expr instanceof Expr.CallLib) {
        tempNotUsed = false;
        return new Stmt.CallStmt(expr, tempVar);
      }
    } finally {
      this.releaseTempVariable(tempVar, tempNotUsed);
    }

    // handle assignment
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

  private assignment(left: Expr, modifier?: Token): Stmt {
    if (!left.assignable) {
      throw this.errorAtCurrent("Expect assignable variable, array element or record field.");
    }

    const operator = this.advance();
    let right = this.expression();
    if (modifier) {
      right = this.binary(left, modifier, right);
    }

    // Type check;
    if (!isTypeEqual(left.type, right.type)) {
      const typecasted = this.implicitTypecast(left.type, right);

      if (typecasted == null) {
        throw this.errorAt(operator,
          `Can't assign value of type ${getTypeName(right.type)} to ${getTypeName(left.type)}`);
      }
      right = typecasted;
    }

    left = this.removeDeref(left);

    if (isString(left.type) || isPointerTo(left.type, isString)){
      return new Stmt.SetString(left, right);
    } else if (isMemoryType(left.type) || isPointer(left.type)) {
      return new Stmt.SetMemory(left, right);
    }

    if (left instanceof Expr.Variable) {
      left.entry.usedCount++; //TODO: usedcount?

      return new Stmt.SetVariable(left, right);
    }

    throw new UnreachableErr("Unknown assignment target");
  }

  private removeDeref(expr: Expr): Expr {
    if (expr instanceof Expr.Deref) {
      expr = expr.ptr;
    }

    return expr;
  }

  private implicitTypecast(targetType: PascalType | undefined, source: Expr): Expr | null {
    // valid implicit typecast: integer to real, char to string
    if (isString(targetType) && source.type === BaseType.Char ) {
      return new Expr.Typecast(source, StringType.create(1));
    } else if (targetType === BaseType.Real && source.type === BaseType.Integer) {
      return new Expr.Typecast(source, BaseType.Real)
    } else {
      return null;
    }
  }

  /** Expression Parsing **/

  private expression(): Expr {
    return this.parsePrecedence(Precedence.Relational);
  }

  private variable(): Expr {
    const varToken = this.previous;

    const entry = this.currentRoutine.findIdentifier(varToken.lexeme);
    if (!entry) {
      const libfuncs = Runtime.findLibraryFunctions(this.libraryUsed, varToken.lexeme);
      if (libfuncs != null) return this.callLibExpr(libfuncs);

      throw this.errorAtPrevious(`Unknown identifier '${varToken.lexeme}'.`);
    }

    switch(entry.entryType) {
      case IdentifierType.Constant: return this.literals(entry.value);
      case IdentifierType.Subroutine: return this.callExpr(entry);
      case IdentifierType.TypeDef: return this.typecast(entry.type);
      case IdentifierType.Variable: {

        if (entry.ownerId !== this.currentRoutine.id) {
          if (entry.level === VariableLevel.LOCAL && entry.usedCount > 0) {
            // assertion: local use of a variable should be parsed after all uses by inner subroutine.
            throw new UnreachableErr("Invalid local-upper variable change.")
          }
          entry.level = VariableLevel.UPPER;
        }
        entry.usedCount++; //TODO: usedcount?

        let expr: Expr = new Expr.Variable(entry);

        if (isPointer(entry.type)) {
          expr = new Expr.Deref(expr);
        }

        return expr;
      };

      default:
        throw new UnreachableErr(`Unknown identifier type for ${entry}`);
    }
  }

  private callExpr(subroutine: Subroutine): Expr {
    const subname = this.previous;
    const [args, hasParentheses] = this.callArgs();

    if (!hasParentheses && this.currentRoutine === subroutine) {
      return new Expr.Variable(subroutine.returnVar);
    }

    const params = subroutine.params;
    if (params.length !== args.length) {
      throw this.errorAt(subname, `Expect ${params.length} arguments, got ${args.length}.`);
    }

    for (let i = 0; i < params.length; i++) {
      if (params[i].paramType === ParamType.REF) {
        let sourceExpr = args[i];

        if (!isPointerTo(params[i].type, sourceExpr.type)) {
          const expectedType = (params[i].type as Pointer).source;
          throw this.errorAt(subname, `Mismatch type at argument #${i + 1}. Expect ${getTypeName(expectedType)}, got ${getTypeName(sourceExpr.type)}`);
        } else if (!sourceExpr.assignable) {
          throw this.errorAt(subname, `Invalid argument #${i + 1}. Expect assignable variable, array element or record field.`);
        }

        sourceExpr = this.removeDeref(sourceExpr);

        if (isPointer(sourceExpr.type)) {
          args[i] = sourceExpr;
        } else if (sourceExpr instanceof Expr.Variable) {
          sourceExpr.entry.level = VariableLevel.UPPER;
          args[i] = new Expr.Refer(sourceExpr);
        } else {
          throw this.errorAt(subname, `Invalid argument #${i + 1}. Expect assignable variable, array element or record field.`);
        }
      } else if (params[i].paramType === ParamType.CONST && isPointer(params[i].type)) {
        const expectedType = (params[i].type as Pointer).source;

        if (!isMemoryType(args[i].type) && !isTypeEqual(expectedType, args[i].type)) {
          throw this.errorAt(subname, `Mismatch type at argument #${i + 1}. Expect ${getTypeName(expectedType)}, got ${getTypeName(args[i].type)}`);
        }
      } else if (!isTypeEqual(params[i].type, args[i].type)) {
        const typecasted = this.implicitTypecast(params[i].type, args[i]);
        if (typecasted == null) {
          throw this.errorAt(subname, `Mismatch type at argument #${i + 1}. Expect ${getTypeName(params[i].type)}, got ${getTypeName(args[i].type)}`);
        }

        args[i] = typecasted;
      }
    }

    return new Expr.Call(subroutine, args);
  }

  private callArgs(): [Expr[], boolean] {
    const args: Expr[] = [];
    let hasParentheses = false;
    if (this.match(TokenTag.LEFT_PAREN)) {
      hasParentheses = true;
      if (!this.check(TokenTag.RIGHT_PAREN)){
        do {
          args.push(this.expression());
        } while(this.match(TokenTag.COMMA));
      }

      this.consume(TokenTag.RIGHT_PAREN, "Expect ')' after arguments.");
    }

    return [args, hasParentheses];
  }

  private callLibExpr(callCandidates: LibraryFunction[]): Expr{
    const funcName = this.previous;
    const [args, _] = this.callArgs();

    for(const func of callCandidates) {
      const params = func.params;
      if (params.length !== args.length) continue;

      let match = true;
      let typecastedArgs = [];
      for (let i = 0; i < params.length; i++) {
        const param = params[i];
        let arg = args[i];

        if (param instanceof Function) {
          // assumption: if it's a function, it's probably can't also be typecasted
          if (!param(arg.type)){
            match = false;
            break;
          }
        } else if (!isTypeEqual(param, arg.type)) {
          const typecasted = this.implicitTypecast(param, arg);

          if (typecasted == null) {
            match = false;
            break;
          }
          arg = typecasted;
        }

        typecastedArgs.push(arg);
      }

      if (!match) continue;

      return new Expr.CallLib(func, typecastedArgs);
    }

    const argtypes = args.map(arg => getTypeName(arg.type)).join(", ");
    throw this.errorAt(funcName, `Unknown library call "${funcName.lexeme}" with parameter of types (${argtypes})`);
  }

  private typecast(targetType: PascalType): Expr {
    const startToken = this.previous;
    this.consume(TokenTag.LEFT_PAREN, "Expect '(' after type name.");
    const expr = this.expression();
    const fromType = expr.type;
    this.consume(TokenTag.RIGHT_PAREN, "Expect ')' after expression.");

    if (isTypeEqual(targetType, fromType)) return expr;

    let valid = false;
    valid ||= (targetType === BaseType.Real && isOrdinal(fromType));
    valid ||= (isString(targetType) && fromType === BaseType.Char);
    valid ||= (isOrdinal(targetType) && isOrdinal(fromType));

    if (!valid) {
      throw this.errorAt(startToken, `Invalid typecast from "${getTypeName(fromType)}" to "${getTypeName(targetType)}".`);
    }

    return new Expr.Typecast(expr, targetType);
  }

  private indexer(left: Expr): Expr {
    let indexes: Expr[] = [];
    let indexTokens: Token[] = [];

    do {
      const token = this.previous;
      const expr = this.expression();

      if (expr.type !== BaseType.Integer) {
        throw this.errorAt(token, `Expect Integer type for operator[], got ${getTypeName(expr.type)}`);
      }

      indexTokens.push(token);
      indexes.push(expr);
    } while (!this.check(TokenTag.RIGHT_SQUARE) && this.match(TokenTag.COMMA));

    this.consume(TokenTag.RIGHT_SQUARE, "Expect ']' after expression.");

    if (isString(left.type)) {
      if (indexes.length > 1) {
        throw this.errorAt(indexTokens[1], `Invalid multi-dimension operator[] for type ${getTypeName(left.type)}`);
      }

      return new Expr.Deref(new Expr.Indexer(left, indexes[0]));
    }

    let indexerExpr = left;
    for (let i = 0; i < indexes.length; i++) {
      const index = indexes[i];
      if (!(indexerExpr.type instanceof ArrayType)) {
        throw this.errorAt(indexTokens[i], `Invalid operator[] for type ${getTypeName(indexerExpr.type)}`);
      }

      indexerExpr = new Expr.Deref(new Expr.Indexer(indexerExpr, index));
    }

    return indexerExpr;
  }

  private field(left: Expr): Expr {
    const start = this.previous;
    const fieldName = this.consume(TokenTag.IDENTIFIER, "Expect identifier.");

    const recordType = left.type;

    if (!isRecord(recordType)) {
      throw this.errorAt(start, `Unknown operator '.' for type ${getTypeName(recordType)}`);
    }

    const fieldData = recordType.fields[fieldName.lexeme];
    if (!fieldData) {
      throw this.errorAt(fieldName, `Unknown field ${fieldName.lexeme} for type ${getTypeName(recordType)}`);
    }

    return new Expr.Deref(new Expr.Field(left, fieldData.offset, fieldData.type));
  }

  private inRange(left: Expr): Expr {
    this.consume(TokenTag.LEFT_SQUARE, "Expect '['.");

    const allowedValues = [TokenTag.CHAR, TokenTag.INTEGER, TokenTag.TRUE, TokenTag.FALSE];
    const ranges: number[] = [];

    do {
      this.consumeAny(allowedValues, "Expect ordinal literal value.");
      const startToken = this.previous;
      const startVal = this.literals(startToken);

      if (!isTypeEqual(left.type, startVal.type)) {
        throw this.errorAtPrevious(`Invalid comparison between type ${getTypeName(left.type)} and ${getTypeName(startVal.type)}`);
      }

      ranges.push(startVal.literal);

      if (!this.match(TokenTag.RANGE)) {
        ranges.push(startVal.literal);
        continue;
      }

      this.consumeAny(allowedValues, "Expect ordinal literal value after '..'.");
      const endToken = this.previous;
      const endVal = this.literals(endToken);

      if (!isTypeEqual(startVal.type, endVal.type)) {
        throw this.errorAtPrevious("Invalid range expression.");
      }

      ranges.push(endVal.literal);

    } while(this.match(TokenTag.COMMA));

    this.consume(TokenTag.RIGHT_SQUARE, "Expect ']'.");

    const tempvar = this.reserveTempVariable(left.type as PascalType);
    this.releaseTempVariable(tempvar);

    return new Expr.InRange(tempvar, left, ranges);
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

    let exprType: PascalType | null = null;

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
        // handle string concatenation
        if (isStringLike(left.type) && isStringLike(right.type)) {
          return this.stringConcat(left, right);
        }

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
        if ((isNumberType(left.type) && isNumberType(right.type)) ||
            (isBool(left.type) && isBool(right.type)) ||
            ((left.type === BaseType.Char) && (right.type === BaseType.Char))
            ) {
          exprType = BaseType.Boolean;
        } else if(isStringLike(left.type) && isStringLike(right.type)) {
          return this.stringCompare(operator, left, right);
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

  private stringConcat(left: Expr, right: Expr): Expr {
    // assumptions: left & right is string or char
    const ptrVar = this.reserveTempVariable(BaseType.Integer);
    const concat = new Expr.StringConcat(ptrVar);

    try {
      this.addStringConcatMember(concat, left);
      this.addStringConcatMember(concat, right);
      return concat;
    } finally {
      this.releaseTempVariable(ptrVar);
    }
  }

  private addStringConcatMember(parent: Expr.StringConcat, operand: Expr) {
    if (operand instanceof Expr.StringConcat) {
      for (const op of operand.operands) {
        parent.operands.push(op);
      }
      return;
    }

    if (operand.type === BaseType.Char) {
      operand = new Expr.Typecast(operand, StringType.create(1));
    }

    parent.operands.push(operand);
  }

  private stringCompare(operator: Token, left: Expr, right: Expr): Expr {
    if (left.type === BaseType.Char) left = new Expr.Typecast(left, StringType.create(1));
    if (right.type === BaseType.Char) right = new Expr.Typecast(right, StringType.create(1));

    return new Expr.StringCompare(operator, left, right);
  }

  private literals(constant?: Token): Expr.Literal {
    const token = constant || this.previous;
    let literal: number = 0;
    let type: PascalType | null = null;

    switch(token.tag) {
      case TokenTag.INTEGER:{
        type = BaseType.Integer;
        literal = token.literal as number;
        break;
      }
      case TokenTag.REAL: {
        type = BaseType.Real;
        literal = token.literal as number;
        break;
      }
      case TokenTag.CHAR: {
        type = BaseType.Char
        literal = token.literal as number;
        break;
      }
      case TokenTag.TRUE:
      case TokenTag.FALSE: {
        type = BaseType.Boolean;
        literal = token.literal ? 1 : 0;
        break;
      }
      case TokenTag.STRING:{
        let stringVal = token.literal as string;
        type = StringType.create(stringVal.length);
        literal = this.addStringLiteral(stringVal);
        break;
      }
      default:
        throw new UnreachableErr("Can't build literal without value");

    }

    const expr = new Expr.Literal(type, literal);
    return expr;
  }

  private addStringLiteral(str: string): number {
    let entry = this.stringLiterals.get(str);
    if (entry == null){
      entry = this.stringLiterals.size;
      this.stringLiterals.set(str, entry);
    }

    return entry;
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

  private consume(tag: TokenTag, errMessage: string): Token {
    if (!this.match(tag)){
      throw this.errorAtCurrent(errMessage);
    }

    return this.previous;
  }

  private consumeAny(tags: TokenTag[], errMessage: string): Token {
    for (let tag of tags) {
      if (this.match(tag)) {
        return this.previous;
      }
    }

    throw this.errorAtCurrent(errMessage);
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
      [TokenTag.STRING]:     entry(parser.literals, null, Precedence.None),
      [TokenTag.CHAR]:       entry(parser.literals, null, Precedence.None),
      [TokenTag.INTEGER]:    entry(parser.literals, null, Precedence.None),
      [TokenTag.REAL]:       entry(parser.literals, null, Precedence.None),
      [TokenTag.TRUE]:       entry(parser.literals, null, Precedence.None),
      [TokenTag.FALSE]:      entry(parser.literals, null, Precedence.None),
      [TokenTag.IDENTIFIER]: entry(parser.variable, null, Precedence.None),

      [TokenTag.LEFT_PAREN]:  entry(parser.grouping, null, Precedence.Call),
      [TokenTag.LEFT_SQUARE]: entry(null, parser.indexer, Precedence.Call),
      [TokenTag.DOT]:         entry(null, parser.field, Precedence.Call),

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
      [TokenTag.IN]:         entry(null, parser.inRange, Precedence.Relational),

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
