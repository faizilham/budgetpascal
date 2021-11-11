program test;

const
  two = 2;
  space = #32;

var
  a, b: integer;
  c: char;
  r: real;

begin
  writeln;
  write;
  begin
    write(#32 = space, space);
    writeln(1+2 > +two, #32, 1+3*-5/6);
  end;

  writeln(1 shl 2, space, 7 shr 1);
  writeln(1 < 1.2, 1 > 1, 1 = 1.1, 1 <> 1);
  writeln(false <> true);

  a := 7;
  writeln(a*9, space, c > #9);

  r := 2;
  r *= a;
  writeln(r);

  begin
    writeln(false);
    writeln()
  end
end.
