"use strict";

const readline = require("node:readline");

console.log("[mock-claude] ready");
console.log("[mock-claude] type a message in the launcher input");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  if (trimmed.toLowerCase() === "exit") {
    console.log("[mock-claude] exiting");
    process.exit(0);
  }

  console.log(`[mock-claude] received: ${trimmed}`);
});

process.on("SIGTERM", () => {
  console.log("[mock-claude] shutdown");
  process.exit(0);
});
