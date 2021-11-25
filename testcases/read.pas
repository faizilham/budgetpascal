program test_read;

type int3 = array[1..3] of integer;

var
  a, x: integer;
  r: real;
  c: char;
  s: string[6];
  arr: int3;

  procedure initArr(var arr: int3);
  begin
    arr[1] := 1;
    arr[2] := 2;
    arr[3] := 3;
  end;

  procedure printArr(const arr: int3);
  begin
    writeln(arr[1], ' ', arr[2], ' ', arr[3]);
  end;

  procedure readInt(var n: integer);
  begin
    readln(n);
    writeln('readInt ', n);
  end;

  procedure readIntInner(var n: integer);
    procedure inner;
    begin
      readln(n);
    end;
  begin
    inner;
    writeln('readIntInner ', n);
  end;


begin
  write('input: ');
  readln(a, x, r);
  read(c);
  readln(s);
  writeln(a, ' ', x, ' ', r, ' ', c);
  writeln(s);

  readln(s[1]);
  writeln(s);

  initArr(arr);
  readln(arr[2], arr[3]);
  printArr(arr);

  readInt(a);
  writeln(a);

  readIntInner(a);
  writeln(a);
end.
