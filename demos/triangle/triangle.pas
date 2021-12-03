program PascalTriangle;

  procedure Pascal(r : Integer);
    var
      i, c, k : Integer;
    begin
      for i := 0 to r-1 do
      begin
        c := 1;
        for k := 0 to i do
        begin
          write(c, ' ');
          c := (c * (i-k)) div (k+1);
        end;
        writeln;
     end;
  end;

  var n: integer;

begin
	write('Lines (1-20): '); readln(n);
  if (n > 0) and (n <= 20) then
  	Pascal(n)
  else
  	writeln('Lines must be between 1 and 20');
end.
