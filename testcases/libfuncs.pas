program libfuncs;

var
  str: string[7];
  arr: array[1..3] of integer;
  arr2: array[2..5] of char;
  c: char;

  procedure printPos(const substr, str: string);
  begin
    writeln(substr, ' ', pos(substr, str))

  end;

begin
  str := 'hello';
  writeln(length(str), ' ', str);
  str := 'hello world';
  writeln(length(str), ' ', str);

  writeln(length(arr), ' ', length(arr2));

  str := 'abcdefg';

  for c := 'a' to 'h' do begin
    writeln(c, ' ', pos(c, str));
  end;

  printPos('abc', str);
  printPos('defg', str);
  printPos('evg', str);
end.
{
5 hello
7 hello w
3 4
a 1
b 2
c 3
d 4
e 5
f 6
g 7
h 0
abc 1
defg 4
evg 0
}
