program typedef;
  type
    int = integer;
    custom = integer;

  var
    a: integer;
    b: custom;
    c: char;

  procedure test(c: int);
    type custom = real;
    var r: custom;
  begin
    r := c / 10;
    writeln(r);
  end;

begin
  b := 10;
  a := 20;

  writeln(a + b);
  test(10);

  b := 97;
  c := char(b);

  writeln(c, ' ', custom(c));
end.
