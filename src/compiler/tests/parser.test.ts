import { Parser } from "../parser";
import fs from "fs/promises";
import { expect } from "chai";
import { MockLogger } from "./mock_console";

const testfileDir = "testcases/errors/"

const runTest = async (testname: string) => {
  const [buffer1, buffer2] = await Promise.all([
    fs.readFile(`${testfileDir}${testname}.pas`),
    fs.readFile(`${testfileDir}${testname}.out`)
  ]);

  const output = buffer2.toString().trim().split(/\r?\n/);
  const logger = new MockLogger();
  const parser = new Parser(buffer1.toString(), logger);

  const result = parser.parse();

  expect(result).to.be.undefined;
  expect(logger.lines.length).to.eq(output.length);

  for (let i = 0; i < output.length; i++) {
    expect(logger.lines[i]).to.eq(output[i]);
  }
};

describe("Parser error test", () => {
  it ('Generate syntax error report', async () => runTest("syntax_err"));
  it ('Generate typing error report', async () => runTest("type_err"));
});
