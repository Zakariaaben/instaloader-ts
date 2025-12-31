#!/usr/bin/env bun
import { Instaloader } from "../src/index.ts";

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log("Usage: bun scripts/login.ts <username> [password]");
    console.log("");
    console.log("If password is not provided, you'll be prompted for it.");
    process.exit(1);
  }

  const username = args[0]!;
  let password = args[1];

  if (!password) {
    process.stdout.write("Password: ");
    password = await new Promise<string>((resolve) => {
      let input = "";
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (char: string) => {
        if (char === "\n" || char === "\r" || char === "\u0004") {
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          console.log("");
          resolve(input);
        } else if (char === "\u0003") {
          process.exit(1);
        } else if (char === "\u007F" || char === "\b") {
          input = input.slice(0, -1);
        } else {
          input += char;
        }
      });
    });
  }

  const loader = new Instaloader({ quiet: false });

  try {
    console.log(`Logging in as ${username}...`);
    await loader.login(username, password);
    console.log("Login successful!");
    
    await loader.saveSessionToFile();
    console.log("Session saved. You can now run logged-in tests.");
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "TwoFactorAuthRequiredException") {
      console.log("Two-factor authentication required.");
      process.stdout.write("Enter 2FA code: ");
      
      const code = await new Promise<string>((resolve) => {
        let input = "";
        process.stdin.resume();
        process.stdin.setEncoding("utf8");
        process.stdin.once("data", (data: string) => {
          input = data.trim();
          resolve(input);
        });
      });

      try {
        await loader.twoFactorLogin(code);
        console.log("2FA login successful!");
        await loader.saveSessionToFile();
        console.log("Session saved. You can now run logged-in tests.");
      } catch (e) {
        console.error("2FA login failed:", e instanceof Error ? e.message : e);
        process.exit(1);
      }
    } else {
      console.error("Login failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    }
  } finally {
    loader.close();
  }
}

main();
