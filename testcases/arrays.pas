program arrays;

type
  int6 = array[1..6] of integer;
  matrix26 = array[1..2, 1..6] of integer;

var
  arr, arr2: array[1..6] of integer;
  mat: array[1..2] of array[1..6] of integer;
  mat2: matrix26;
  i: integer;

  procedure printArray(const arr: int6);
  var i: integer;
  begin
    for i := 1 to 6 do write(arr[i], ' ');
    writeln;
  end;

  procedure fillArray(var arr: int6);
  var i: integer;
  begin
    for i := 1 to 6 do arr[i] := i;
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
end.
