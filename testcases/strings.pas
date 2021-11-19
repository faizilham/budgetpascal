program strings;

var
  a: string[7];
  b: string[11];
  c: string;

const
  helloworld = 'hello world!';

begin
  writeln(helloworld);
  writeln('test');
  writeln('hello ' + 'world ', 'hello ' + 'test ', 'test ' + 'world');
  a := 'test' + ' string';
  writeln(a);

  a := '';
  writeln(a);

  b := helloworld;
  writeln(b);

  a := b;
  writeln(a);

  a := 'test';

  c := b + ' ' + (a + #32) + 'string';

  writeln(c);

  writeln('ab' > 'abcd');
  writeln(a = 'test');
  writeln(a <> 'hello');
  writeln('ab' >= 'ac');
  writeln('abcd' < 'ab');
end.
