Budget Pascal
=============
A compiler for a small subset of Pascal (hence, "budget") to WebAssembly.

### Why Pascal?
When I was reorganizing my files, I found a [hangman game](demos/hangman/hangman.pas) that my friends and I wrote 10 years ago for a programming class project.
I think it would be fun to try to compile and run it on the web.

### Why WebAssembly?
I want something that can run on the web for easy demo, and compiling pascal to web assembly seems more challenging and fun than "just" making a custom VM or transpiling to javascript.

Building & Running
------------------
1. Make sure to have node and yarn installed
2. Run `yarn install` to install all dependencies
3. Run `yarn build` to build the CLI, or `yarn build-web` for the web version.
4. To use the CLI, run `yarn start [pascal filename]`. To use the web UI, just serve directory `dist/web` using [serve](https://github.com/vercel/serve) or other http server.

Which Subset of Pascal?
-----------------------
Because implementing full-blown Pascal is really time consuming, I decided to just implement at least what I need to run that hangman game. What is and what is not included will seem arbitrary but I tried my best to include some basic features. I also try to make sure that the compiler compiles a strictly subset of Pascal, meaning if a program is successfully compiled by this compiler, it should also be successfully compiled in other major Pascal compilers like FreePascal.

If you actually need to compile Pascal codes to webassembly, I suggest first to use [FreePascal to compile WebAssembly with LLVM](https://wiki.freepascal.org/WebAssembly/Compiler).

Implemented data types:
- `integer`, 32-bit signed integer
- `char`, 8-bit unsigned integer
- `boolean`, 8-bint unsigned integer
- `real`, 64-bit floating point number
- `string`, Pascal-style static-sized ShortString
- `array`, Array type with staticly declared size
- `record`, Pascal record type
- `file` and `text`, Pascal binary and text file type

Notable datatypes that didn't get included (non-exhaustive):
- Different-sized integers and real numbers
- Enumeration type
- Range type
- Set
- Pointers
- AnsiString, PChar, and other character types
- Dynamic Arrays
- Record with variant parts

Implemented expressions, statements and other language constructs:
- All arithmetic, logic and binary operators
- Read and write to console or file
- `in` set expression, like `x in [1, 2..5, 9..11]`
- Partially implemented range expression in `case of` statements and array index declaration.
- Typecasting between basic types
- Basic compound and control flow statements: `begin-end`, `if-else`, `case-of`, `for to/downto`, `repeat-until`, `while-do`
- Variable, constant and type definition with global & local scoping
- Procedure and function, with `var` and `const` parameter
- Procedure / function declarations inside another procedure / function
- A very small number of library functions and procedures from standard library and crt library

Notable language constructs that didn't get included (non-exhaustive):
- All object pascal features (class, exception, etc.)
- Units and user-defined libraries
- Initializing variable in declaration
- Function and operator overloading
- Forward declaration
- `for-in` and `with` statement
- Set operator expressions other than `in`
- Pointer address expression
- Most procedure and functions in the standard library

Other limitation and details:
- Array and record memory arrangement are packed and not aligned to powers of 2, so it might affect performance and processing binary files of array / record types might be incompatible with other compilers.
- Call stack is limited to 256
- Total memory is limited to 4 MB
