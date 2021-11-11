program test;

const
  pi = 3.14;
  cent = 100;

var
  a, x, y: integer;
  b: boolean;
  c: char;
  r: real;

begin
  a := pi;
  r := c;
  b := c;
  a := 1 / 3;

  r := 1 div #32;
  r := 1 mod r;
  r := 1 + b;
  r := 1 - c;
  r := 1.7 * c;
  r := 1.7 / b;
  r := 1.7 >> 4;
  r := 1.7 << c;
  b := r = 1; // ok
  b := r = b;
  b := a <> b;
  b := a < b;
  b := a > c;
  b := b >= c;
  b := r <= c;

  b += 1;
  r -= c;
  c *= 3;
  a /= a;

  cent := 10;

end.
