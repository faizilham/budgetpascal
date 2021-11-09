export enum TokenType {
  EOF, ENDFILE, UNKNOWN,                        // endfile is "end.", unknown for errors

  // Math operators
  PLUS, MINUS, MULTIPLY, POW, SLASH, DIV, MOD,  // + - * ** / div mod

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
  TYPE, UNTIL, VAR, WHILE,
}

export class Token {
  constructor(public type: TokenType, public lexeme: string, public line: number,
    public literal?: (boolean|string|number)) {}

  toString(): string {
    const values: any[] = [TokenType[this.type], this.lexeme, this.line];
    if (this.literal != null) values.push(this.literal);
    return values.join(' ');
  }
}

const OneSymbolTokens : {[key: string]: TokenType} = {
  "+": TokenType.PLUS,
  "-": TokenType.MINUS,
  "*": TokenType.MULTIPLY,
  "/": TokenType.SLASH,
  ":": TokenType.COLON,
  "(": TokenType.LEFT_PAREN,
  ")": TokenType.RIGHT_PAREN,
  "[": TokenType.LEFT_SQUARE,
  "]": TokenType.RIGHT_SQUARE,
  "=": TokenType.EQUAL,
  ">": TokenType.GREATER,
  "<": TokenType.LESS,
  ".": TokenType.DOT,
  ",": TokenType.COMMA,
  ";": TokenType.SEMICOLON,
};

const AssignmentTokens = {
  "+": TokenType.ASSIGN_PLUS,
  "-": TokenType.ASSIGN_MIN,
  "*": TokenType.ASSIGN_MUL,
  "/": TokenType.ASSIGN_SLASH,
  ":": TokenType.ASSIGN,
};

const KeywordTokens : {[key: string]: TokenType} = {
  "and": TokenType.AND,
  "array": TokenType.ARRAY,
  "begin": TokenType.BEGIN,
  "break": TokenType.BREAK,
  "continue": TokenType.CONTINUE,
  "case": TokenType.CASE,
  "const": TokenType.CONST,
  "div": TokenType.DIV,
  "do": TokenType.DO,
  "downto": TokenType.DOWNTO,
  "else": TokenType.ELSE,
  "end": TokenType.END,
  "false": TokenType.FALSE,
  "for": TokenType.FOR,
  "function": TokenType.FUNCTION,
  "forward": TokenType.FORWARD,
  "if": TokenType.IF,
  "in": TokenType.IN,
  "mod": TokenType.MOD,
  "not": TokenType.NOT,
  "of": TokenType.OF,
  "or": TokenType.OR,
  "procedure": TokenType.PROCEDURE,
  "program": TokenType.PROGRAM,
  "record": TokenType.RECORD,
  "repeat": TokenType.REPEAT,
  "shl": TokenType.SHL,
  "shr": TokenType.SHR,
  "then": TokenType.THEN,
  "to": TokenType.TO,
  "true": TokenType.TRUE,
  "type": TokenType.TYPE,
  "until": TokenType.UNTIL,
  "var": TokenType.VAR,
  "while": TokenType.WHILE,
  "xor": TokenType.XOR,
};

export class Scanner {
  current: number = 0;
  start: number = 0;
  line: number = 1;
  eof: Token | null = null;

  constructor(public text: string){
    this.reset();
  }

  reset() {
    this.line = 1;
    this.start = 0;
    this.current = 0;
    this.eof = null;
  }

  scanToken(): Token {
    this.skipWhitespace();
    if (this.current >= this.text.length) {
      return this.eofToken();
    }

    this.start = this.current;
    const prev = this.advance();
    let type = TokenType.EOF;

    if (isNumber(prev)) {
      return this.number();
    } else if ((prev === '_' ) || isAlpha(prev)) {
      return this.identifier();
    }

    switch(prev) {
      // assignments & its single operator variants
      case '+':
      case '-':
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

      case '*': {
        const current = this.peek();
        if (current === '=') {
          this.advance();
          type = AssignmentTokens[prev];
        } else if (current === '*'){
          this.advance();
          type = TokenType.POW;
        } else {
          type = OneSymbolTokens[prev];
        }

        return this.makeToken(type);
      }

      case '=': return this.makeToken(TokenType.EQUAL);
      case '>': {
        const current = this.peek();

        switch(current) {
          case '>': type = TokenType.SHR; break;
          case '=': type = TokenType.GREATER_EQ; break;
          default:
            return this.makeToken(TokenType.GREATER);
        }

        this.advance();
        return this.makeToken(type);
      }

      case '<': {
        const current = this.peek();

        switch(current) {
          case '>': type = TokenType.NOT_EQ; break;
          case '<': type = TokenType.SHL; break;
          case '=': type = TokenType.LESS_EQ; break;
          default:
            return this.makeToken(TokenType.LESS);
        }

        this.advance();
        return this.makeToken(type);
      }

      case "'": return this.stringLiteral();

      case '#': return this.char();

      case '.': {
        if (this.peek() === '.') {
          this.advance();
          type = TokenType.RANGE;
        } else {
          type = OneSymbolTokens[prev];
        }

        return this.makeToken(type);
      }

      default: {
        const foundType : TokenType | undefined = OneSymbolTokens[prev];

        if (foundType != null) {
          return this.makeToken(foundType);
        }
      }

      return this.makeToken(TokenType.UNKNOWN);
    }

  }

  makeToken(type: TokenType): Token {
    const lexeme = this.text.substring(this.start, this.current);
    return new Token(type, lexeme, this.line);
  }

  number() : Token {
    let isInteger = true;
    while (isNumber(this.peek())) {
      this.advance();
    }

    let current = this.peek();
    if (current === '.') {
      isInteger = false;
      this.advance();

      const lastIndex = this.current;
      while (isNumber(this.peek())) {
        this.advance();
      }

      if (this.current === lastIndex) {
        // no number after '.', illegal token
        return this.makeToken(TokenType.UNKNOWN);
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
        return this.makeToken(TokenType.UNKNOWN);
      }
    }

    let token;
    if (isInteger) {
      token = this.makeToken(TokenType.INTEGER);
      token.literal = parseInt(token.lexeme, 10);
    } else {
      token = this.makeToken(TokenType.REAL);
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
      return this.makeToken(TokenType.UNKNOWN);
    }

    let token = this.makeToken(TokenType.CHAR);
    const charVal = parseInt(token.lexeme.substring(1), 10);

    if (charVal > 255) {
      return this.makeToken(TokenType.UNKNOWN);
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

    const keywordType = KeywordTokens[identifier] || TokenType.IDENTIFIER;
    const token = new Token(keywordType, lexeme, this.line);

    switch (keywordType) {
      case TokenType.TRUE: {
        token.literal = true;
        break;
      }
      case TokenType.FALSE: {
        token.literal = false;
        break;
      }
      case TokenType.END: {
        if (this.peek() === '.') {
          this.advance();
        token.type = TokenType.ENDFILE;
        }
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
      return this.makeToken(TokenType.UNKNOWN);
    }

    let token = this.makeToken(TokenType.STRING);
    let str = token.lexeme.substring(1, token.lexeme.length - 1);
    token.literal = str.replace(/''/g, "'");
    return token;
  }

  eofToken() {
    if (!this.eof) {
      this.eof = new Token(TokenType.EOF, "", this.line);
    }

    return this.eof;
  }

  skipWhitespace() {
    for (;;) {
      let current = this.peek();
      switch(current) {
        case '\n':
          this.line++;
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

  private advance() : string {
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
}

function isNumber(c: string): boolean {
  return c >= '0' && c <= '9';
}

function isAlpha(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
}
