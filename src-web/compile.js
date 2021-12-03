import {compile} from "../src";

const sendMessage = (command, data) => {
  self.postMessage({command, data});
};

const logger = {
  error(...messages) {
    const data = messages.join(" ");
    sendMessage("log", data);
  }
};

self.addEventListener('message', (event) => {
  runCompile(event.data);
});

function runCompile(code) {
  sendMessage("log", "Compiling...");
  const binary = compile(code, logger);
  sendMessage("finish", binary);
}
