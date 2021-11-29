program files;
  type
    arr3 = array[1..3] of integer;
    filearr = array [1..3] of file of integer;
    filerec = record
      size: integer;
      f: file of integer;
    end;
    point = record
      x,y,z: integer;
      code: char;
    end;
  var
    f: file of integer;
    f1: file of real;
    f2: file of point;
    a: arr3;
    p: point;
    i, x: integer;
    str: string[5];
    r: real;

    txt: text;

  procedure setpoint(var p: point; x,y,z: integer; code: char);
  begin
    p.x := x;
    p.y := y;
    p.z := z;
    p.code := code;
  end;

  procedure printPoint(const p: point);
  begin
    writeln(p.code, ' : (', p.x, ',', p.y, ',', p.z, ')');
  end;

begin
  assign(txt, 'tmp/files_text.txt');
  rewrite(txt);
  writeln(txt, 1, 2, 3);
  writeln(txt, 'abcdefg':10);
  writeln(txt, 1.5:8:3);
  writeln('txt written!');
  close(txt);

  reset(txt);
  readln(txt, x);
  readln(txt, str);
  readln(txt, r);
  close(txt);

  writeln(x, ' ', r);
  writeln(str);

  assign(f, 'tmp/files_bin1');
  rewrite(f);
  x := 5;
  write(f, x);
  write(f, 767);
  write(f, 655360);
  close(f);

  reset(f);
  for i := 1 to 3 do
    read(f, a[i]);
  close(f);

  for i := 1 to 3 do write(a[i], ' ');
  writeln;

  assign(f1, 'tmp/files_bin2');
  rewrite(f1);
  write(f1, 1.2345);
  write(f1, 3.4567);
  close(f1);

  reset(f1);
  read(f1, r);
  writeln(r);
  read(f1, r);
  writeln(r);
  close(f1);

  assign(f2, 'tmp/files_bin3');
  rewrite(f2);

  setpoint(p, 1,2,3, 'a');
  write(f2, p);

  setpoint(p, 5,6,7, 'b');
  write(f2, p);

  setpoint(p, 8,9,10, 'c');
  write(f2, p);
  close(f2);

  reset(f2);
  while not eof(f2) do begin
    read(f2, p);
    printPoint(p);
  end;

  close(f2);

end.
