program arrays;

type
  int6 = array[1..6] of integer;
  matrix26 = array[1..2, 1..6] of integer;

const
  four = 4;
  seven = 7;

var
  arr, arr2: array[1..6] of integer;
  mat: array[1..2] of array[1..6] of integer;
  mat2: matrix26;
  i: integer;
  str: string[5];
  arr3: array[four..seven] of integer;
  arrstr: array[1..2] of string[5];

  procedure printArray(const arr: int6);
  var i: integer;
  begin
    for i := 1 to 6 do write(arr[i], ' ');
    writeln;
  end;

  procedure printInner(const arr: int6);
    procedure inner;
    begin
      printArray(arr);
    end;
  begin
    inner;
  end;

  procedure fillArray(var arr: int6);
  var i: integer;
  begin
    for i := 1 to 6 do arr[i] := i;
  end;

  function createArray(arr: int6): int6;
  var i: integer;
  begin
    for i := 1 to 6 do begin
      createArray[i] := arr[i] + i;
      arr[i] := -1;
    end;
  end;

  procedure printMatrix(const mat: matrix26);
  var i, j: integer;
  begin
    for i := 1 to 2 do begin
      for j := 1 to 6 do begin
        write(mat[i,j], ' ');
      end;
      writeln;
    end;
  end;

  procedure upperArr(var arrv: int6);
    var arr3: int6;
    procedure inner;
    begin
      fillArray(arr3);
      arr3[1] := 99;
      arrv[1] := 98;
    end;
  begin
    inner;
    printArray(arr3);
    printArray(arr);
    arr[1] := 12;
  end;

begin
  fillArray(arr);
  fillArray(arr2);

  arr[1] := 10;
  arr[2] := arr[1] + 100;
  writeln(arr[1], ' ', arr[2]);

  printArray(arr);
  printArray(arr2);
  arr2 := arr;
  printArray(arr2);

  fillArray(mat[1]);
  mat[2] := arr;

  mat2 := mat;

  for i := 1 to 6 do
    if i mod 2 = 0 then
      mat2[1][i] := -1;

  printMatrix(mat);
  printMatrix(mat2);

  upperArr(arr);
  printArray(arr);

  fillArray(arr2);
  arr := createArray(arr2);
  printArray(arr);
  printArray(arr2);

  str := 'hello';
  writeln(str[2]);
  str[2] := 'p';

  writeln(str);

  printInner(mat[2]);

  for i := 1 to 4 do begin
    arr3[i + 3] := i;
  end;

  writeln(arr3[4], arr3[5], arr3[6], arr3[7]);

  arrstr[1] := 'world';
  writeln(arrstr[1,1], arrstr[1][5]);
end.
