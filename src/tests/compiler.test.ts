import { Parser } from "../parser";
import fs from "fs/promises";
import { expect } from "chai";
import { MockConsole } from "./console.mock";
import { Emitter } from "../emitter";
import { Program } from "../routine";

const testfileDir = "testcases/"

const runTest = async (testname: string) => {
  const [buffer1, buffer2] = await Promise.all([
    fs.readFile(`${testfileDir}${testname}.pas`),
    fs.readFile(`${testfileDir}${testname}.out`)
  ]);

  const output = buffer2.toString().trim().split(/\r?\n/);
  const parser = new Parser(buffer1.toString());
  const program = parser.parse();

  expect(program).to.not.be.undefined;

  const emitter = new Emitter(program as Program);
  const binary = emitter.emit(false);
  const mod = new WebAssembly.Module(binary);

  const csl = new MockConsole();
  const wasmImports = csl.getImport();
  const instance = new WebAssembly.Instance(mod, wasmImports);

  csl.setMemory(instance.exports.mem as WebAssembly.Memory);
  const main: any = instance.exports.main;
  main();

  expect(csl.lines.length).to.eq(output.length);

  for (let i = 0; i < output.length; i++) {
    expect(csl.lines[i]).to.eq(output[i]);
  }
};

describe("Compiler test", () => {
  it("Generate correct output for 'basic_expression' program",
    async () => runTest("basic_expression"));
  it("Generate correct output for 'branching' program",
    async () => runTest("branching"));
  it("Generate correct output for 'strings' program",
    async () => runTest("strings"));
  it("Generate correct output for 'subroutine' program",
    async () => runTest("subroutine"));
})
