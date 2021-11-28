program write_format;
  var
    a, b: integer;
    r: real;
    s: string;
begin
  r := 1.5;
  a := 12345;
  b := 8;
  writeln(a);
  writeln(a:3);
  writeln(a:7);
  // writeln(a:7:1); // illegal, only for real
  writeln(a:(b + 3));

  writeln(r:2);
  writeln(r:2:5);
  writeln(r:6:3);

  s := 'hello';
  writeln('test':6, s:7, a:6);
end.
