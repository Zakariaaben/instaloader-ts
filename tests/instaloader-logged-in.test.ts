import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import {
  Instaloader,
  isErr,
  isOk,
  isSome,
  type Post,
  type SessionData,
} from "../src/index.ts";

const OWN_USERNAME = "zakaria_._ben";
const PUBLIC_PROFILE = "selenagomez";
const PAGING_MAX_COUNT = 15;
const TEST_TIMEOUT = 90000;

function getSessionPath(username: string): string {
  const configDir = process.env["XDG_CONFIG_HOME"] ?? path.join(homedir(), ".config");
  return path.join(configDir, "instaloader", `session-${username}`);
}

async function loadSessionFromFile(username: string): Promise<SessionData | null> {
  try {
    const sessionPath = getSessionPath(username);
    const data = await readFile(sessionPath, "utf-8");
    return JSON.parse(data) as SessionData;
  } catch {
    return null;
  }
}

describe("Instaloader Logged In Tests", () => {
  let loader: Instaloader;
  let testDir: string;
  let sessionAvailable = false;

  beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "instaloader-test-"));
    console.log(`Testing in ${testDir}`);
    process.chdir(testDir);

    const loaderResult = await Instaloader.create({
      quiet: false,
      sleep: true,
    });

    if (isErr(loaderResult)) {
      throw new Error("Failed to create Instaloader");
    }
    loader = loaderResult.value;

    const sessionData = await loadSessionFromFile(OWN_USERNAME);
    if (sessionData) {
      const result = await loader.loadSessionData(OWN_USERNAME, sessionData);
      if (isOk(result)) {
        sessionAvailable = true;
        console.log("Session loaded successfully");
      } else {
        console.log(`Could not load session: ${result.error}`);
      }
    } else {
      console.log(`Session file not found: ${getSessionPath(OWN_USERNAME)}`);
    }
  });

  afterAll(async () => {
    process.chdir("/");
    console.log(`Removing ${testDir}`);
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function postPagingTest(posts: Post[], maxCount: number = PAGING_MAX_COUNT): void {
    let previousPost: Post | null = null;
    let count = 0;
    for (const post of posts) {
      const dateStr = isSome(post.dateUtc) ? post.dateUtc.value.toISOString() : "N/A";
      console.log(`Post: ${post.shortcode} - ${dateStr}`);
      if (previousPost && isSome(post.dateUtc) && isSome(previousPost.dateUtc)) {
        expect(post.dateUtc.value.getTime()).toBeLessThan(previousPost.dateUtc.value.getTime());
      }
      previousPost = post;
      count++;
      if (count >= maxCount) break;
    }
  }

  test("test login", async () => {
    if (!sessionAvailable) {
      console.log("Skipping: No session available");
      return;
    }
    const result = await loader.testLogin();
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(OWN_USERNAME);
    }
  }, TEST_TIMEOUT);

  test("public profile paging", async () => {
    if (!sessionAvailable) {
      console.log("Skipping: No session available");
      return;
    }

    const profileResult = await loader.getProfile(PUBLIC_PROFILE);
    expect(isOk(profileResult)).toBe(true);
    if (isErr(profileResult)) return;

    const profile = profileResult.value;
    const posts: Post[] = [];

    for await (const postResult of profile.getPosts()) {
      if (isErr(postResult)) {
        console.error("Error fetching post:", postResult.error);
        continue;
      }
      posts.push(postResult.value);
      if (posts.length >= PAGING_MAX_COUNT) break;
    }

    postPagingTest(posts);
  }, TEST_TIMEOUT);

  test("saved paging", async () => {
    if (!sessionAvailable) {
      console.log("Skipping: No session available");
      return;
    }

    const profileResult = await loader.getOwnProfile();
    expect(isOk(profileResult)).toBe(true);
    if (isErr(profileResult)) return;

    const profile = profileResult.value;
    console.log(`Getting saved posts for ${profile.username}`);

    const savedPostsResult = await profile.getSavedPosts();
    expect(isOk(savedPostsResult)).toBe(true);
    if (isErr(savedPostsResult)) return;

    const savedPosts: Post[] = [];
    for await (const postResult of savedPostsResult.value) {
      if (isErr(postResult)) {
        console.error("Error fetching saved post:", postResult.error);
        continue;
      }
      const post = postResult.value;
      const dateStr = isSome(post.dateUtc) ? post.dateUtc.value.toISOString() : "N/A";
      console.log(`Saved Post: ${post.shortcode} - ${dateStr}`);
      savedPosts.push(post);
      if (savedPosts.length >= PAGING_MAX_COUNT) break;
    }
  }, TEST_TIMEOUT);
});
