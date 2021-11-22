program scoping;
var
  xyz: integer;

  function useXYZ(n: integer): integer;
  begin
    useXYZ := n * xyz;
    xyz += 1;
  end;

  procedure printXYZ;
    function timesXYZ(n: integer): integer;
    begin
      timesXYZ := xyz * n;
    end;
  begin
    writeln(timesXYZ(3), ' ', timesXYZ(5));
  end;

  procedure testUpper(n: integer);
  var upper, upper2: integer;

    function inner1: integer;
    begin
      inner1 := upper + n;
    end;

    procedure inner2(n: integer);
    begin
      upper := n;
      upper2 := n + 1;
    end;

  begin
    upper := 5;
    writeln(inner1);
    inner2(10);
    writeln(inner1, ' ', upper2);
  end;

  procedure upperString(s: string);
  var
    s2: string[5];
    function inner1: string;
    begin
      inner1 := s + s2;
    end;

    procedure inner2(s: string);
      procedure inner3;
      begin
        s2 := s;
      end;
    begin
      inner3;
    end;
  begin
    s2 := 'world';
    writeln(inner1);
    inner2('people');
    writeln(inner1);
  end;

  procedure outerRec(startUpper, n: integer);
    var upper: integer;

    procedure innerRec(n: integer);
    begin
      if n > 0 then begin
        writeln('inner ', upper);
        upper += 1;
        innerRec(n - 1);
      end;
    end;

  begin
    if n > 0 then begin
      upper := startUpper;
      writeln('outer-a ', n, ' ', upper);
      innerRec(3);
      writeln('outer-b ', n, ' ', upper);
      outerRec(startUpper - 1, n - 1);
    end;
  end;

begin
  xyz := 1;
  writeln(useXYZ(2), ' ', xyz);
  writeln(useXYZ(2), ' ', xyz);

  xyz := 5;
  writeln(useXYZ(2), ' ', xyz);

  xyz := 10;
  printXYZ;

  testUpper(6);
  upperString('howdy');
  outerRec(10, 3);
end.
