import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  Instaloader,
  getDefaultSessionFilename,
  Profile,
  Post,
} from "../src/index.ts";

const PROFILE_WITH_HIGHLIGHTS = 325732271;
const OWN_USERNAME = "zakaria_._ben";
const PUBLIC_PROFILE = "selenagomez";
const NORMAL_MAX_COUNT = 2;
const PAGING_MAX_COUNT = 15;
const STORIES_MAX_COUNT = 3;
const TEST_TIMEOUT = 30000;

describe("Instaloader Logged In Tests", () => {
  let L: Instaloader;
  let testDir: string;
  let sessionAvailable = false;

  beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "instaloader-test-"));
    console.log(`Testing in ${testDir}`);
    process.chdir(testDir);
    L = new Instaloader({
      downloadGeotags: true,
      downloadComments: true,
      saveMetadata: true,
    });
    L.context.raiseAllErrors = true;

    const sessionFile = getDefaultSessionFilename(OWN_USERNAME);
    if (fs.existsSync(sessionFile)) {
      try {
        await L.loadSessionFromFile(OWN_USERNAME);
        sessionAvailable = true;
        console.log("Session loaded successfully");
      } catch (e) {
        console.log(`Could not load session: ${e}`);
      }
    } else {
      console.log(`Session file not found: ${sessionFile}`);
    }
  });

  afterAll(() => {
    L.close();
    process.chdir("/");
    console.log(`Removing ${testDir}`);
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  async function postPagingTest(
    iterator: AsyncIterable<Post>,
    maxCount: number = PAGING_MAX_COUNT,
  ): Promise<void> {
    let previousPost: Post | null = null;
    let count = 0;
    for await (const post of iterator) {
      console.log(post.toString());
      if (previousPost) {
        expect(post.dateUtc.getTime()).toBeLessThan(
          previousPost.dateUtc.getTime(),
        );
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
    const username = await L.testLogin();
    expect(username).toBe(OWN_USERNAME);
  }, TEST_TIMEOUT);

  test("stories paging", async () => {
    if (!sessionAvailable) {
      console.log("Skipping: No session available");
      return;
    }
    let storyCount = 0;
    for await (const userStory of L.getStories()) {
      console.log(`profile ${userStory.ownerUsername}.`);
      let itemCount = 0;
      for await (const item of userStory.getItems()) {
        console.log(item.toString());
        itemCount++;
        if (itemCount >= 3) break;
      }
      storyCount++;
      if (storyCount >= STORIES_MAX_COUNT) break;
    }
  }, TEST_TIMEOUT);

  test("highlights paging", async () => {
    if (!sessionAvailable) {
      console.log("Skipping: No session available");
      return;
    }
    let highlightCount = 0;
    for await (const userHighlight of L.getHighlights(PROFILE_WITH_HIGHLIGHTS)) {
      const itemcount = await userHighlight.getItemcount();
      console.log(
        `Retrieving ${itemcount} highlights "${userHighlight.title}" from profile ${userHighlight.ownerUsername}`,
      );
      let itemCount = 0;
      for await (const item of userHighlight.getItems()) {
        console.log(item.toString());
        itemCount++;
        if (itemCount >= 3) break;
      }
      highlightCount++;
      if (highlightCount >= 3) break;
    }
  }, TEST_TIMEOUT);

  test("public profile paging", async () => {
    if (!sessionAvailable) {
      console.log("Skipping: No session available");
      return;
    }
    const profile = await Profile.fromUsername(L.context, PUBLIC_PROFILE);
    await postPagingTest(profile.getPosts());
  }, TEST_TIMEOUT);

  test("feed paging", async () => {
    if (!sessionAvailable) {
      console.log("Skipping: No session available");
      return;
    }
    let count = 0;
    for await (const post of L.getFeedPosts()) {
      console.log(post.toString());
      count++;
      if (count >= PAGING_MAX_COUNT) break;
    }
  }, TEST_TIMEOUT);

  test("saved paging", async () => {
    if (!sessionAvailable) {
      console.log("Skipping: No session available");
      return;
    }
    const profile = await Profile.ownProfile(L.context);
    console.log(`Getting saved posts for ${profile.username}`);
    let count = 0;
    for await (const post of profile.getSavedPosts()) {
      console.log(post.toString());
      count++;
      if (count >= PAGING_MAX_COUNT) break;
    }
  }, TEST_TIMEOUT);

  test.skip("stories download", async () => {
    if (!sessionAvailable) {
      console.log("Skipping: No session available");
      return;
    }
    await L.downloadStories();
  });

  test.skip("public profile download", async () => {
    if (!sessionAvailable) {
      console.log("Skipping: No session available");
      return;
    }
    const profile = await Profile.fromUsername(L.context, PUBLIC_PROFILE);
    await L.downloadProfile(profile, { stories: true });
  });

  test.skip("feed download", async () => {
    if (!sessionAvailable) {
      console.log("Skipping: No session available");
      return;
    }
    await L.downloadFeedPosts({ maxCount: NORMAL_MAX_COUNT });
  });
});
