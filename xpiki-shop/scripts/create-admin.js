#!/usr/bin/env node
// Interactive helper to create the first web panel login.
// Usage: npm run create-admin  [-- <username> <password>]

const readline = require("readline");
const { db } = require("../src/db");
const auth = require("../src/web/auth");

function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (!hidden) {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }
    // Suppress echo so the password is not left on screen.
    const onData = (char) => {
      if (["\n", "\r", ""].includes(char.toString())) {
        process.stdin.removeListener("data", onData);
        return;
      }
      readline.moveCursor(process.stdout, -1000, 0);
      readline.clearLine(process.stdout, 1);
      process.stdout.write(question + "*".repeat(rl.line.length));
    };
    process.stdout.write(question);
    process.stdin.on("data", onData);
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function main() {
  const [argUser, argPass] = process.argv.slice(2);

  const username = argUser || (await ask("Admin username: "));
  if (!username) {
    console.error("A username is required.");
    process.exit(1);
  }

  const existing = db
    .prepare("SELECT * FROM admin_users WHERE username = ?")
    .get(username.toLowerCase());

  const password = argPass || (await ask("Password (min 8 chars): ", { hidden: true }));
  if (!password || password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  if (existing) {
    auth.setAdminPassword(username, password);
    console.log(`Password updated for "${username.toLowerCase()}".`);
  } else {
    auth.createAdmin(username, password);
    console.log(`Admin "${username.toLowerCase()}" created. Sign in at /admin/`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
