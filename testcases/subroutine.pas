program subroutines;
  var
    sum: integer;
    str: string;

  type
    string5 = string[5];

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
    if hello then begin
      test := 'hello ';
    end else begin
      test := 'bye ';
    end;

    test_str := test + c;
  end;

  function test_str2: string;
  begin
    test_str2 := test_str(false, 'c') + ' ';
  end;

  function test_str3(s1, s2: string5): string;
  begin
    test_str3 := s1 + ':' + s2;
  end;

  function factorial(n: integer): integer;
  begin
    if n < 1 then begin
      factorial := 1;
    end else begin
      factorial := n * factorial(n - 1);
    end;
  end;

  procedure recursePrint(n: integer);
  begin
    if n < 1 then begin
      writeln;
    end else begin
      write(n, ' ');
      recursePrint(n-1);
    end;
  end;

  function multi(c: char; n: integer): string;
  begin
    if n < 1 then begin
      multi := '';
    end else begin
      multi := c + multi(c, n-1);
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

  writeln(test_str3('hello world', 'world hello'));
  writeln(multi('w', 5));

  writeln('5!: ', factorial(5));
  recursePrint(3);
end.
