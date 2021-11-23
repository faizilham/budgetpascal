program constvar_params;
  procedure test_const(const a: integer; const s: string);
  begin
    writeln(a, ' ', s);
  end;

  procedure test_const_upper(const a: integer; const s, s1: string);
    procedure print;
    begin
      writeln(a, ' ', s1);
    end;
  begin
    print;
    writeln(s);
  end;

  procedure test_var(var a: integer);
  begin
    writeln(a);
    a := 17;
  end;

  procedure test_var_upper(var a: integer);
    procedure inner;
    begin
      a += 2;
    end;
  begin
    a := 10;
    inner;
  end;

  function fn_var(var a: integer): integer;
  begin
    fn_var := a;
    a := 99;
  end;

  function fn_var_upper(var a: integer): integer;
    function inner: integer;
    begin
      inner := a + 100;
      a := 20;
    end;
  begin
    fn_var_upper := inner;
  end;

  var x, y: integer;

  procedure var_global(var a: integer);
    var m, n: integer;

    procedure inner(var k: integer);
    begin
      k := 10;
      writeln(n = k);
    end;
  begin
    a := 12;
    writeln(x = a);
    inner(n);
    n := 12;
    inner(m);
  end;
begin
  test_const(1, 'test');
  test_const_upper(1, 'test', 'test2');

  x := 22;
  test_var(x);
  writeln(x);

  test_var_upper(x);
  writeln(x);

  x := 73;
  y := fn_var(x);
  writeln(x, ' ', y);

  x := 88;
  y := fn_var_upper(x);
  writeln(x, ' ', y);

  var_global(x);
end.
