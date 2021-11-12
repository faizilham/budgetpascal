export enum TokenTag {
  EOF, UNKNOWN,                                 // token unknown for error markers

  // Math operators
  PLUS, MINUS, MULTIPLY, SLASH, DIV, MOD,       // + - * / div mod

  // Bitwise & logic operators
  AND, OR, XOR, NOT, SHL, SHR,                  // << & >> also converted to SHL & SHR

  // Relational operator
  EQUAL, GREATER, LESS, GREATER_EQ, LESS_EQ,    // = > < >= <=
  NOT_EQ, IN,                                   // <> in

  // Assignment operator
  ASSIGN, ASSIGN_PLUS, ASSIGN_MIN,              // := += -=
  ASSIGN_MUL, ASSIGN_SLASH,                     // /=

  // Other symbols
  LEFT_PAREN, RIGHT_PAREN,                      // ( )
  LEFT_SQUARE, RIGHT_SQUARE,                    // [ ]
  DOT, COMMA, RANGE, COLON, SEMICOLON,           // . , .. : ;

  // Literals
  IDENTIFIER, STRING, CHAR, INTEGER, REAL, TRUE, FALSE,

  // Keywords
  ARRAY, BEGIN, BREAK, CONTINUE, CASE, CONST, DO, DOWNTO, ELSE, END, FOR,
  FUNCTION, FORWARD, IF, OF, PROCEDURE, PROGRAM, RECORD, REPEAT, THEN, TO,
  TYPE, UNTIL, VAR, WHILE, READ, READLN, WRITE, WRITELN
}

export class Token {
  constructor(public tag: TokenTag, public lexeme: string, public line: number, public column: number,
    public literal?: (boolean|string|number)) {}

  copy(): Token {
    return new Token(this.tag, this.lexeme, this.line, this.column, this.literal);
  }

  toString(): string {
    const values: any[] = [TokenTag[this.tag], this.lexeme, this.line];
    if (this.literal != null) values.push(this.literal);
    return values.join(' ');
  }
}

const OneSymbolTokens : {[key: string]: TokenTag} = {
  "+": TokenTag.PLUS,
  "-": TokenTag.MINUS,
  "*": TokenTag.MULTIPLY,
  "/": TokenTag.SLASH,
  ":": TokenTag.COLON,
  "(": TokenTag.LEFT_PAREN,
  ")": TokenTag.RIGHT_PAREN,
  "[": TokenTag.LEFT_SQUARE,
  "]": TokenTag.RIGHT_SQUARE,
  "=": TokenTag.EQUAL,
  ">": TokenTag.GREATER,
  "<": TokenTag.LESS,
  ".": TokenTag.DOT,
  ",": TokenTag.COMMA,
  ";": TokenTag.SEMICOLON,
};

const AssignmentTokens = {
  "+": TokenTag.ASSIGN_PLUS,
  "-": TokenTag.ASSIGN_MIN,
  "*": TokenTag.ASSIGN_MUL,
  "/": TokenTag.ASSIGN_SLASH,
  ":": TokenTag.ASSIGN,
};

const KeywordTokens : {[key: string]: TokenTag} = {
  "and": TokenTag.AND,
  "array": TokenTag.ARRAY,
  "begin": TokenTag.BEGIN,
  "break": TokenTag.BREAK,
  "continue": TokenTag.CONTINUE,
  "case": TokenTag.CASE,
  "const": TokenTag.CONST,
  "div": TokenTag.DIV,
  "do": TokenTag.DO,
  "downto": TokenTag.DOWNTO,
  "else": TokenTag.ELSE,
  "end": TokenTag.END,
  "false": TokenTag.FALSE,
  "for": TokenTag.FOR,
  "function": TokenTag.FUNCTION,
  "forward": TokenTag.FORWARD,
  "if": TokenTag.IF,
  "in": TokenTag.IN,
  "mod": TokenTag.MOD,
  "not": TokenTag.NOT,
  "of": TokenTag.OF,
  "or": TokenTag.OR,
  "procedure": TokenTag.PROCEDURE,
  "program": TokenTag.PROGRAM,
  "read": TokenTag.READ,
  "readln": TokenTag.READLN,
  "record": TokenTag.RECORD,
  "repeat": TokenTag.REPEAT,
  "shl": TokenTag.SHL,
  "shr": TokenTag.SHR,
  "then": TokenTag.THEN,
  "to": TokenTag.TO,
  "true": TokenTag.TRUE,
  "type": TokenTag.TYPE,
  "until": TokenTag.UNTIL,
  "var": TokenTag.VAR,
  "while": TokenTag.WHILE,
  "write": TokenTag.WRITE,
  "writeln": TokenTag.WRITELN,
  "xor": TokenTag.XOR,
};

export class Scanner {
  current: number = 0;
  start: number = 0;
  line: number = 1;
  column: number = 1;
  eof: Token | null = null;
  lastError: string = "";

  constructor(public text: string){
    this.reset();
  }

  reset() {
    this.line = 1;
    this.column = 1;
    this.start = 0;
    this.current = 0;
    this.eof = null;
    this.lastError = "";
  }

  scanToken(): Token {
    this.skipWhitespace();
    if (this.current >= this.text.length) {
      return this.eofToken();
    }

    this.start = this.current;
    const prev = this.advance();
    let type = TokenTag.EOF;

    if (isNumber(prev)) {
      return this.number();
    } else if ((prev === '_' ) || isAlpha(prev)) {
      return this.identifier();
    }

    switch(prev) {
      // assignments & its single operator variants
      case '+':
      case '-':
      case '*':
      case '/':
      case ':': {
        if (this.peek() === '=') {
          this.advance();
          type = AssignmentTokens[prev];
        } else {
          type = OneSymbolTokens[prev];
        }

        return this.makeToken(type);
      }

      case '=': return this.makeToken(TokenTag.EQUAL);
      case '>': {
        const current = this.peek();

        switch(current) {
          case '>': type = TokenTag.SHR; break;
          case '=': type = TokenTag.GREATER_EQ; break;
          default:
            return this.makeToken(TokenTag.GREATER);
        }

        this.advance();
        return this.makeToken(type);
      }

      case '<': {
        const current = this.peek();

        switch(current) {
          case '>': type = TokenTag.NOT_EQ; break;
          case '<': type = TokenTag.SHL; break;
          case '=': type = TokenTag.LESS_EQ; break;
          default:
            return this.makeToken(TokenTag.LESS);
        }

        this.advance();
        return this.makeToken(type);
      }

      case "'": return this.stringLiteral();

      case '#': return this.char();

      case '.': {
        if (this.peek() === '.') {
          this.advance();
          type = TokenTag.RANGE;
        } else {
          type = OneSymbolTokens[prev];
        }

        return this.makeToken(type);
      }

      default: {
        const foundType : TokenTag | undefined = OneSymbolTokens[prev];

        if (foundType != null) {
          return this.makeToken(foundType);
        }
      }

      const token = this.makeToken(TokenTag.UNKNOWN);
      this.reportError(`Unknown symbol ${token.lexeme}`);
      return token;
    }

  }

  makeToken(type: TokenTag): Token {
    const lexeme = this.text.substring(this.start, this.current);
    return new Token(type, lexeme, this.line, this.columnStart());
  }

  number() : Token {
    let isInteger = true;
    while (isNumber(this.peek())) {
      this.advance();
    }

    let current = this.peek();
    if (current === '.') {
      if (this.peekNext() === '.') {
        // special case for handling range without space: 2..5
        let token = this.makeToken(TokenTag.INTEGER);
        token.literal = parseInt(token.lexeme, 10);
        return token;
      }

      isInteger = false;
      this.advance();

      const lastIndex = this.current;
      while (isNumber(this.peek())) {
        this.advance();
      }

      if (this.current === lastIndex) {
        // no number after '.', illegal token
        this.reportError("Invalid number format, expected digits after '.'");
        return this.makeToken(TokenTag.UNKNOWN);
      }
    }

    current = this.peek();
    if (current === 'e' || current === 'E') {
      isInteger = false;
      this.advance();

      current = this.peek();
      if (current === '-' || current === '+') this.advance();

      const lastIndex = this.current;
      while(isNumber(this.peek())) {
        this.advance();
      }

      if (this.current === lastIndex) {
        // no number after (e|E)[+-]? , illegal token
        this.reportError("Invalid number format, expected digits after exponent sign");
        return this.makeToken(TokenTag.UNKNOWN);
      }
    }

    let token;
    if (isInteger) {
      token = this.makeToken(TokenTag.INTEGER);
      token.literal = parseInt(token.lexeme, 10);
    } else {
      token = this.makeToken(TokenTag.REAL);
      token.literal = parseFloat(token.lexeme);
    }

    return token;
  }

  char() : Token {
    let lastIndex = this.current;

    while (isNumber(this.peek())){
      this.advance();
    }

    if (lastIndex === this.current) {
      // no number after #, illegal token
      this.reportError("Invalid char format, expected digits after '#'");
      return this.makeToken(TokenTag.UNKNOWN);
    }

    let token = this.makeToken(TokenTag.CHAR);
    const charVal = parseInt(token.lexeme.substring(1), 10);

    if (charVal > 255) {
      this.reportError("Char code is larger than 255'");
      return this.makeToken(TokenTag.UNKNOWN);
    }

    token.literal = charVal;
    return token;
  }

  identifier(): Token {
    let current = this.peek();
    while (current === '_' || isAlpha(current) || isNumber(current)) {
      this.advance();
      current = this.peek();
    }

    const lexeme = this.text.substring(this.start, this.current);
    const identifier = lexeme.toLowerCase();

    const keywordType = KeywordTokens[identifier] || TokenTag.IDENTIFIER;
    const token = new Token(keywordType, lexeme, this.line, this.columnStart());

    switch (keywordType) {
      case TokenTag.TRUE: {
        token.literal = true;
        break;
      }
      case TokenTag.FALSE: {
        token.literal = false;
        break;
      }
      default:
        break;
    }

    return token;
  }

  stringLiteral(): Token {
    let finished = false;

    while(!this.isAtEnd() && !finished) {
      const prev = this.advance();
      if (prev === "'") {
        if (this.peek() === "'") {
          this.advance();
        } else {
          finished = true;
        }
      }
    }

    if (!finished) {
      // no matching ' found, illegal
      this.reportError("Wrong number of matching quote");
      return this.makeToken(TokenTag.UNKNOWN);
    }

    let token = this.makeToken(TokenTag.STRING);
    let str = token.lexeme.substring(1, token.lexeme.length - 1);
    token.literal = str.replace(/''/g, "'");
    return token;
  }

  eofToken() {
    if (!this.eof) {
      this.eof = new Token(TokenTag.EOF, "", this.line, this.column);
    }

    this.eof.line = this.line;
    this.eof.column = this.column;
    return this.eof;
  }

  skipWhitespace() {
    for (;;) {
      let current = this.peek();
      switch(current) {
        case '\n': {
          this.line++;
          this.column = 1;
        }
          // fallthrough
        case ' ':
        case '\t':
        case '\r':
          this.advance();
        break;

        case '{': {
          let prev = "";
          do {
            prev = this.advance();
            if (prev === '\n') {
              this.line++;
            }
          } while (prev !== '}' && !this.isAtEnd());
          break;
        }

        case '/': {
          if (this.peekNext() !== '/') {
            return;
          }

          while(this.peek() !== '\n' && !this.isAtEnd()) {
            this.advance();
          }

          break;
        }

        case '(': {
          if (this.peekNext() !== '*') {
            return;
          }

          this.advance(); this.advance();

          while (!this.isAtEnd()) {
            const prev = this.advance();

            if (prev === '*' && this.peek() === ')') {
              this.advance();
              break;
            } else if (prev === '\n') {
                this.line++;
            }
          }

          break;
        }

        default:
          return;
      }
    }
  }

  private columnStart(): number {
    return this.column - (this.current - this.start) - 1;
  }

  private advance() : string {
    this.column++;
    return this.text[this.current++];
  }

  private isAtEnd() : boolean {
    return this.current >= this.text.length;
  }

  private peek() : string {
    if (this.current >= this.text.length) {
      return "";
    }
    return this.text[this.current];
  }

  private peekNext() : string {
    if (this.current+1 >= this.text.length) {
      return "";
    }

    return this.text[this.current+1];
  }

  private reportError(message: string) {
    this.lastError = message;
  }
}

function isNumber(c: string): boolean {
  return c >= '0' && c <= '9';
}

function isAlpha(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
}
