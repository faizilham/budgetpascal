program basic_expression;

var
  a, x: integer;
  b: boolean;

const
  space = #32;
  pi = 3.14;

var r: real;

begin
  write(0, space, #97, space, pi, space);
  writeln(true, space, false);
  writeln(1 - 2 * +6 div -3);
  writeln(2 * (7 + 3) / 5.0);
  writeln(234 mod 5 * 2);
  writeln(7 >> 1, 3 shl 2);
  writeln(5 xor 8);
  writeln(not 15 + 8);
  writeln(not(7.3 < 8));
  writeln(space > #97);
  writeln((7 = 1) xor (3 >= 2));
  writeln((5.3 <= 1) xor (pi <> 3.14));

  a := 5;
  x := 7;
  a += x;
  writeln(a);

  r := 6 * (8 - 1);
  r /= x;
  writeln(r);
end.
