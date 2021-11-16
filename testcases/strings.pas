program strings;

var
  a: string[7];
  b: string[11];
  c: string;

begin
  writeln('hello world!');
  writeln('test');
  a := 'test' + ' string';
  writeln(a);

  a := '';
  writeln(a);

  b := 'hello world!';
  writeln(b);

  a := b;
  writeln(a);

  a := 'test';

  c := b + ' ' + a + #32 + 'string';

  writeln(c);
end.
{
  results
  hello world!
  test
  test
  hello world
  hello w
}
