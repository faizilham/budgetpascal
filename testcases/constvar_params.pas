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
begin
  test_const(1, 'test');
  test_const_upper(1, 'test', 'test2');
end.
