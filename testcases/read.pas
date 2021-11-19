program test_read;
var
  a, x: integer;
  r: real;
  c: char;
  s: string[6];

begin
  write('input: ');
  readln(a, x, r);
  read(c);
  readln(s);
  writeln(a, ' ', x, ' ', r, ' ', c);
  writeln(s);
end.
