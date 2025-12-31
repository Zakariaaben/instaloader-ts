#!/usr/bin/env bun
import { Effect, pipe, Exit, Cause } from "effect";
import {
  makeInstaloaderContext,
  saveSessionToFileEffect,
  PlatformLayer,
  TwoFactorAuthRequiredError,
} from "../src/index.ts";

function readPassword(): Promise<string> {
  return new Promise<string>((resolve) => {
    process.stdout.write("Password: ");
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

function read2FACode(): Promise<string> {
  return new Promise<string>((resolve) => {
    process.stdout.write("Enter 2FA code: ");
    let input = "";
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (data: string) => {
      input = data.trim();
      resolve(input);
    });
  });
}

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
    password = await readPassword();
  }

  const program = Effect.gen(function* () {
    const ctx = yield* makeInstaloaderContext({ quiet: false });
    
    console.log(`Logging in as ${username}...`);
    
    const loginResult = yield* pipe(
      ctx.login(username, password),
      Effect.exit
    );
    
    if (Exit.isFailure(loginResult)) {
      const cause = loginResult.cause;
      const defects = Cause.defects(cause);
      const failures = Cause.failures(cause);
      
      // Check if it's a 2FA error
      let is2FA = false;
      for (const failure of failures) {
        if (failure instanceof TwoFactorAuthRequiredError) {
          is2FA = true;
          break;
        }
      }
      
      if (is2FA) {
        console.log("Two-factor authentication required.");
        const code = yield* Effect.promise(() => read2FACode());
        yield* ctx.twoFactorLogin(code);
        console.log("2FA login successful!");
      } else {
        // Re-fail with the original cause
        return yield* Effect.failCause(cause);
      }
    } else {
      console.log("Login successful!");
    }
    
    yield* pipe(
      saveSessionToFileEffect(ctx),
      Effect.provide(PlatformLayer)
    );
    console.log("Session saved. You can now run logged-in tests.");
    
    yield* ctx.close;
  });

  try {
    await Effect.runPromise(program);
  } catch (err: unknown) {
    console.error("Login failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
