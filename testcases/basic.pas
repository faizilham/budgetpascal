program test;

begin
  writeln;
  write;
  begin
    write(#32 = #32, #32);
    writeln(1+2 > +2, #32, 1+3*-5/6);
  end;

  writeln(1 shl 2, #32, 7 shr 1);
  writeln(1 < 1.2, 1 > 1, 1 = 1.1, 1 <> 1);
  writeln(false <> true);

  begin
    writeln(false);
    writeln()
  end
end.
