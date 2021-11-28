program files;
  type
    arr3 = array[1..3] of integer;
    filearr = array [1..3] of file of integer;
    filerec = record
      size: integer;
      f: file of integer;
    end;
    point = record
      x,y: integer;
      c: real;
      z: integer;
    end;
  var
    f: file of arr3;
    f2: file of point;
    a: arr3;
    p: point;

    txt: text;

begin
  assign(txt, 'tmp/files_text.txt');
  rewrite(txt);
  writeln(txt, 1, 2, 3);
  writeln(txt, 'abcdefg':10, 1.5:0:3);
  writeln('txt written!');
  close(txt);
end.
