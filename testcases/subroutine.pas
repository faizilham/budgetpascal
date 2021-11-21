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

begin
  printAdd(2, 3);
  loopPrint(4);
end.
