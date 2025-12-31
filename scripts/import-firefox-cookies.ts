#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Effect, pipe } from "effect";
import {
  makeInstaloaderContext,
  saveSessionToFileEffect,
  PlatformLayer,
  type CookieJar,
  type InstaloaderContextShape,
} from "../src/index.ts";

function findFirefoxCookiesDb(): string | null {
  const homeDir = os.homedir();
  const firefoxDir = path.join(homeDir, ".mozilla", "firefox");
  
  if (!fs.existsSync(firefoxDir)) {
    return null;
  }

  const profiles = fs.readdirSync(firefoxDir);
  for (const profile of profiles) {
    if (profile.endsWith(".default-release") || profile.endsWith(".default")) {
      const cookiesPath = path.join(firefoxDir, profile, "cookies.sqlite");
      if (fs.existsSync(cookiesPath)) {
        return cookiesPath;
      }
    }
  }

  for (const profile of profiles) {
    const cookiesPath = path.join(firefoxDir, profile, "cookies.sqlite");
    if (fs.existsSync(cookiesPath)) {
      return cookiesPath;
    }
  }

  return null;
}

function getInstagramCookies(dbPath: string): CookieJar {
  const tempPath = `/tmp/firefox_cookies_${Date.now()}.sqlite`;
  fs.copyFileSync(dbPath, tempPath);
  
  const db = new Database(tempPath, { readonly: true });
  
  const cookies: CookieJar = {};
  
  try {
    const rows = db.query(`
      SELECT name, value 
      FROM moz_cookies 
      WHERE host LIKE '%instagram.com'
    `).all() as { name: string; value: string }[];
    
    for (const row of rows) {
      cookies[row.name] = row.value;
    }
  } finally {
    db.close();
    fs.unlinkSync(tempPath);
  }
  
  return cookies;
}

async function main() {
  const args = process.argv.slice(2);
  let username = args[0];

  console.log("Looking for Firefox cookies database...");
  const dbPath = findFirefoxCookiesDb();
  
  if (!dbPath) {
    console.error("Could not find Firefox cookies database.");
    console.error("Make sure Firefox is installed and you've logged into Instagram.");
    process.exit(1);
  }

  console.log(`Found: ${dbPath}`);
  console.log("Extracting Instagram cookies...");
  
  const cookies = getInstagramCookies(dbPath);
  
  if (!cookies["sessionid"]) {
    console.error("No Instagram session found in Firefox cookies.");
    console.error("Make sure you're logged into Instagram in Firefox.");
    process.exit(1);
  }

  console.log(`Found ${Object.keys(cookies).length} Instagram cookies.`);

  const program = Effect.gen(function* () {
    const ctx: InstaloaderContextShape = yield* makeInstaloaderContext({ quiet: false });
    
    yield* ctx.loadSession("", cookies);
    
    console.log("Testing session...");
    const loggedInUser = yield* ctx.testLogin;
    
    if (!loggedInUser) {
      console.error("Session is invalid or expired. Please log into Instagram in Firefox again.");
      process.exit(1);
    }

    if (!username) {
      username = loggedInUser;
    }

    console.log(`Logged in as: ${loggedInUser}`);
    
    yield* ctx.loadSession(loggedInUser, cookies);
    
    yield* pipe(
      saveSessionToFileEffect(ctx),
      Effect.provide(PlatformLayer)
    );
    
    console.log(`\nSession saved! You can now run logged-in tests.`);
    console.log(`\nTo update the test file, set OWN_USERNAME to: ${loggedInUser}`);
    
    yield* ctx.close;
  });

  try {
    await Effect.runPromise(program);
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
