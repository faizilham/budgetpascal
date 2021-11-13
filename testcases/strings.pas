program strings;

var
  a: string[7];
  b: string[11];

begin
  writeln('hello world!');
  writeln('test');
  a := 'test';
  writeln(a);

  b := 'hello world!';
  writeln(b);

  a := b;
  writeln(a);
end.
{
  results
  hello world!
  test
  test
  hello world
  hello w
}
