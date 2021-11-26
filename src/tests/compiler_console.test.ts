import { expect } from "chai";
import fs from "fs/promises";
import { createReadStream } from "fs";
import { spawn } from "child_process";

const testfileDir = "testcases/"

function runCompiler(filename: string, inputfile?: string) {
  return new Promise<string[]>((resolve) => {
    const childproc = spawn('node', ['dist/cmd/index.js', filename, "--test"]);
    const outputs: string[] = [];

    if (inputfile) {
      createReadStream(inputfile).pipe(childproc.stdin);
    }

    childproc.stdout.on('data', (data) => {
      outputs.push(data.toString());
    });

    childproc.stderr.on('data', (data) => {
      outputs.push(data.toString());
    });

    childproc.on('close', () => {
      let lines = ''.concat(...outputs).trimRight().split("\n");
      lines.shift(); // remove the "Compiled in ..."
      resolve(lines);
    });
  });
}

async function runTest(testname: string, hasInput = false){
  const filename = `${testfileDir}${testname}.pas`;

  const buffer = await fs.readFile(`${testfileDir}${testname}.out`);
  const output = buffer.toString().trim().split(/\r?\n/);

  let inputfile: string | undefined;
  if (hasInput) inputfile = `${testfileDir}${testname}.in`;

  const results = await runCompiler(filename, inputfile);

  expect(results.length).to.eq(output.length);

  for (let i = 0; i < output.length; i++) {
    const line = results[i].trimRight();

    const errMessage = `Mismatched ouput at line ${i+1}, expect ${output[i]}, got ${line}.`;
    expect(line).to.eq(output[i], errMessage);
  }
}

describe("Compiler with real console test", function() {
  this.timeout(5000);

  const tests: [string, boolean][] = [
    ["read", true],
    ["libfuncs", false],
  ];

  for (let [test, hasInput] of tests) {
    it(`Generate correct output for '${test}' program`, async () => runTest(test, hasInput));
  }
})
