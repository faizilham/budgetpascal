program branching;

const
  nine = 9;
  charA = 'a';
  char102 = #102;
  cent = 100;

var
  a, i, j: integer;
  c: char;

begin
  if true then writeln(1);

  if false then
  else writeln(2);

  a := 3;

  if a = 3 then begin
    writeln(3);
  end;

  if a = 4 then begin
    writeln(4);
    if a mod 2 = 0 then writeln(4.5);
  end else begin
    writeln(5);
    if a mod 2 = 1 then writeln(5.5);
  end;

  a := 7;

  if a = 1 then begin
    writeln(6);
    writeln(6.5);
  end else if a = 8 then begin
    writeln(7);
    writeln(7.5);
  end else if a = 7 then begin
    writeln(8);
    writeln(8.5);
  end else begin
    writeln(9);
    writeln(9.5);
  end;

  a := 1;
  repeat
    case a of
      5, 6: writeln(56);
      1, 7..9:
        case a of
          8: writeln(8)
        else
          writeln(179)
        end;
      10..13: writeln(1013)
    else
      write(#97, #32);
      writeln(a);
    end;
    a += 1;
  until a = 12;

  c := #97;
  case c of
    charA..#99: writeln(123);
    #100..char102: writeln(456);
  end;

  case c of
    #92: writeln(92)
  end;

  a := 6;
  i := 0;
  while i < a do begin
    i += 1;
    if i = 3 then continue;
    write(i, #32);

    j := 0;
    while j < a do begin
      j += 1;
      if j = i then break
      else if j = 2 then continue;
      write(j, #32);
    end;

    writeln;
  end;

  a := 3;
  for i := 1 to a + 1 do
    write(10 + i, #32);
  writeln(a);

  for i := a downto 1 do begin
    if i = 2 then continue;
    write(20 + i, #32);
  end;
  writeln(a);

  for i := 2 to 1 do
    write(50 + i, #32);
  writeln(a);

  for c := #65 to #100 do begin
    write(c);
    if c = #70 then break;
  end;
  writeln;

  c := 'e';

  if c in ['a', 'x'..'z', 'c'..'f'] then
    writeln('included: ', c)
  else
    writeln('excluded: ', c);

  a := 8;
  if a in [88..cent, 6, nine..12] then
    writeln('included: ', a)
  else
    writeln('excluded: ', a);

end.
