program subroutines;

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

  var
    sum: integer;

begin
  printAdd(2, 3);
  loopPrint(4);

  sum := add(1, add(2, 3)) + add(4, 5);
  add(2,3);

  writeln(sum);
end.
