import { compile } from "./compiler";

const mod = compile();
const instance : any = new WebAssembly.Instance(mod);

console.log(instance.exports.add(1, 2));
