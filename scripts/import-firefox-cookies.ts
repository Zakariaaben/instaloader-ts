#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import * as fs from "fs";
import { writeFile, mkdir } from "node:fs/promises";
import * as path from "path";
import * as os from "os";
import { Effect } from "effect";
import {
  makeInstaloaderContext,
  type CookieJar,
  type InstaloaderContextShape,
} from "../src/index.ts";

function getSessionPath(username: string): string {
  const configDir = process.env["XDG_CONFIG_HOME"] ?? path.join(os.homedir(), ".config");
  return path.join(configDir, "instaloader", `session-${username}`);
}

async function saveSessionToFile(sessionData: CookieJar, username: string): Promise<void> {
  const sessionPath = getSessionPath(username);
  await mkdir(path.dirname(sessionPath), { recursive: true });
  await writeFile(sessionPath, JSON.stringify(sessionData));
  console.log(`Session saved to ${sessionPath}`);
}

function findFirefoxCookiesDb(): string | null {
  const homeDir = os.homedir();
  
  // Windows path: %APPDATA%\Mozilla\Firefox\Profiles\
  const windowsFirefoxDir = path.join(homeDir, "AppData", "Roaming", "Mozilla", "Firefox", "Profiles");
  
  // Linux/Mac path: ~/.mozilla/firefox
  const unixFirefoxDir = path.join(homeDir, ".mozilla", "firefox");
  
  // Try Windows first, then Unix
  const firefoxDir = fs.existsSync(windowsFirefoxDir) ? windowsFirefoxDir : unixFirefoxDir;
  
  if (!fs.existsSync(firefoxDir)) {
    console.error("Firefox directory not found. Tried:");
    console.error(`  Windows: ${windowsFirefoxDir}`);
    console.error(`  Unix: ${unixFirefoxDir}`);
    return null;
  }

  const profiles = fs.readdirSync(firefoxDir);
  
  // Try default-release or default profiles first
  for (const profile of profiles) {
    if (profile.endsWith(".default-release") || profile.endsWith(".default")) {
      const cookiesPath = path.join(firefoxDir, profile, "cookies.sqlite");
      if (fs.existsSync(cookiesPath)) {
        return cookiesPath;
      }
    }
  }

  // Fallback: try any profile
  for (const profile of profiles) {
    const cookiesPath = path.join(firefoxDir, profile, "cookies.sqlite");
    if (fs.existsSync(cookiesPath)) {
      return cookiesPath;
    }
  }

  return null;
}

function getInstagramCookies(dbPath: string): CookieJar {
  const tempPath = path.join(os.tmpdir(), `firefox_cookies_${Date.now()}.sqlite`);
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
    
    const sessionData = yield* ctx.saveSession;
    yield* Effect.promise(() => saveSessionToFile(sessionData, loggedInUser));
    
    console.log(`\nYou can now run logged-in tests.`);
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
