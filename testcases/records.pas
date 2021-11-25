program records;
  type
    Point = record
      x, y: integer;
    end;
    Line = record
      p1, p2: Point;
    end;

  var
    p1, p2: Point;
    l: Line;
    i: integer;

  procedure printPoint(p: point);
  begin
    writeln(p.x, ' ', p.y);
  end;

  procedure setPoint(var p: point; x,y: integer);
  begin
    p.x := x;
    p.y := y;
  end;

  procedure printLine(const l: line);
  begin
    writeln('(', l.p1.x, ',', l.p1.y, ') - (', l.p2.x, ',', l.p2.y, ')');
  end;

  procedure setl;
  var p: point;
    function inner: point;
    begin
      setPoint(p, -1, -1);
      inner.x := -2;
      inner.y := -2;
    end;
  begin
    l.p2 := inner;
    l.p1 := p;
  end;

begin
  setPoint(p1, 1, 2);
  printPoint(p1);

  p2 := p1;
  p2.y := 10;
  printPoint(p2);

  l.p1 := p1;
  setPoint(l.p2, 23, 15);
  printLine(l);

  setl;
  printLine(l);
end.
