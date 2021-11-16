import { Scanner, TokenTag } from "../scanner";
import fs from "fs/promises";
import { expect } from "chai";

describe("Scanner test", () => {
  it ('Scans all tokens as expected output', async () => {
    let buffer = await fs.readFile("testcases/scanner_test.in");
    const text = buffer.toString();
    const scanner = new Scanner(text);

    buffer = await fs.readFile("testcases/scanner_test.out");
    const results = buffer.toString().trim().split(/\r?\n/);

    const tokens = [];

    let token;
    while((token = scanner.scanToken()).tag !== TokenTag.EOF ) {
      tokens.push(token);
    }

    expect(tokens.length).to.eq(results.length);

    for (let i = 0; i < tokens.length; i++) {
      expect(tokens[i].toString().trim()).to.eq(results[i]);
    }
  });
});
