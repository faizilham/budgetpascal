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

begin
  xyz := 1;
  writeln(useXYZ(2), ' ', xyz);
  writeln(useXYZ(2), ' ', xyz);

  xyz := 5;
  writeln(useXYZ(2), ' ', xyz);

  xyz := 10;
  printXYZ;
end.
