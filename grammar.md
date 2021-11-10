**Syntax Grammar**

<*program*> ::= program <*identifier*>; <*block*> .

<*block*> ::= <*statement part*>

---

<*statement part*> ::= <*compound statement*>

<*compound statement*> ::= begin <*statement*> {; <*statement*>} end

<*statement*> ::= <*assignment*> | <*read statement*> | <*write statement*>

<*assignment*> ::= <*variable*> <*assignment operator*> <*expression*>

<*read statement*> ::= read "(" <*variable*> {, <*variable*>} ")"

<*write statement*> ::= write "(" <*expression*> {, <*expression*>} ")"

<*variable*> ::= <*identifier*>

---

<*expression*> ::= <*literal*> | <*unary*> | <*binary*> | <*grouping*>

<*grouping*> ::= "(" <*expression*> ")"

<*unary*> ::= (+ | - | not) <*expression*>

<*binary*> ::= <*expression*> <*binary operator*> <*expression*>

<*binary operator*> ::= + | - | * | / | div | mod | and | not | xor | shr | shl | << | >> | = | < | > | <= | >= | <>

<*assignment operator*> ::= ":=" | "+=" | "-=" | "*=" | "/="

**Lexical Grammar**

<*literal*> ::= true | false | <*number*> | <*char*> | <*string*> | <*identifier*>

<*number*> ::= <*digit*> { <*digit*> } [ . { <*digit*> } ] [ (e|E) [+|-] { <*digit*> } ]

<*identifier*> ::= ( _ | <*alpha*> ) { _ | <*digit*> | <*alpha*> }

<*string*> ::= ' { <*any string except '* > | ' ' } '

<*char*> ::= # 0..255

<*digit*> ::= 0..9

<*alpha*> ::= a..z | A..Z
