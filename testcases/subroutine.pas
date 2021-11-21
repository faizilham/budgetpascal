program subroutines;
  var
    sum: integer;
    str: string;

  procedure printAdd(a, b: integer);
  begin
    writeln(a + b);
  end;

  procedure loopPrint(n: integer);
  var i: integer;
  begin
    for i := 1 to n do begin
      write(i, ' ');
    end;
    writeln;
  end;

  function add(a, b: integer): integer;
  begin
    add := a + b;
  end;

  function test_str(hello: boolean; c: char): string;
  var test: string[6];
  begin
    if hello then test := 'hello ';
    else test := 'bye ';

    test_str := test + c;
  end;

  function test_str2: string;
  begin
    test_str2 := test_str(false, 'c') + ' ';
  end;

  function factorial(n: integer): integer;
  begin
    if n < 1 then factorial := 1;
    else factorial := n * factorial(n - 1);
  end;

  procedure recursePrint(n: integer);
  begin
    if n < 1 then writeln;
    else begin
      write(n, ' ');
      recursePrint(n-1);
    end;
  end;

begin
  printAdd(2, 3);
  loopPrint(4);

  sum := add(1, add(2, 3)) + add(4, 5);
  add(2,3);
  writeln(sum);

  writeln(test_str(true, 'a'));

  str := test_str(true, 'b');
  writeln(str);

  str += ' ' + test_str2 + test_str(true, 'd');
  writeln(str);

  writeln('5!: ', factorial(5));
  recursePrint(3);
end.
