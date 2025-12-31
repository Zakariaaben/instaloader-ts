import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Effect, Stream, pipe, Option } from "effect";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  getDefaultSessionFilename,
  makeInstaloaderContext,
  loadSessionFromFileEffect,
  PlatformLayer,
  profileFromUsername,
  profileOwnProfile,
  profileUsername,
  profileGetPostsStream,
  profileGetSavedPostsStream,
  postFromNodeSync,
  postToString,
  postDateUtc,
  type InstaloaderContextShape,
  type JsonNode,
  type PostData,
  type ProfileData,
} from "../src/index.ts";

const OWN_USERNAME = "zakaria_._ben";
const PUBLIC_PROFILE = "selenagomez";
const PAGING_MAX_COUNT = 15;
const TEST_TIMEOUT = 30000;

describe("Instaloader Logged In Tests", () => {
  let ctx: InstaloaderContextShape;
  let testDir: string;
  let sessionAvailable = false;

  beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "instaloader-test-"));
    console.log(`Testing in ${testDir}`);
    process.chdir(testDir);

    ctx = await Effect.runPromise(makeInstaloaderContext({
      quiet: false,
      sleep: true,
    }));

    const sessionFile = getDefaultSessionFilename(OWN_USERNAME);
    if (fs.existsSync(sessionFile)) {
      try {
        await Effect.runPromise(
          pipe(
            loadSessionFromFileEffect(ctx, OWN_USERNAME),
            Effect.provide(PlatformLayer)
          )
        );
        sessionAvailable = true;
        console.log("Session loaded successfully");
      } catch (e) {
        console.log(`Could not load session: ${e}`);
      }
    } else {
      console.log(`Session file not found: ${sessionFile}`);
    }
  });

  afterAll(async () => {
    await Effect.runPromise(ctx.close);
    process.chdir("/");
    console.log(`Removing ${testDir}`);
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function postPagingTest(
    posts: PostData[],
    maxCount: number = PAGING_MAX_COUNT,
  ): void {
    let previousPost: PostData | null = null;
    let count = 0;
    for (const post of posts) {
      console.log(postToString(post));
      if (previousPost) {
        const currentDate = Option.getOrThrow(postDateUtc(post));
        const previousDate = Option.getOrThrow(postDateUtc(previousPost));
        expect(currentDate.getTime()).toBeLessThan(previousDate.getTime());
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
    const username = await Effect.runPromise(ctx.testLogin);
    expect(username).toBe(OWN_USERNAME);
  }, TEST_TIMEOUT);

  test("public profile paging", async () => {
    if (!sessionAvailable) {
      console.log("Skipping: No session available");
      return;
    }

    const profile = await Effect.runPromise(profileFromUsername(ctx, PUBLIC_PROFILE));

    const postsStream = await Effect.runPromise(
      profileGetPostsStream(
        ctx,
        profile,
        (node: JsonNode, _profile: ProfileData) => postFromNodeSync(node)
      )
    );

    const posts = await Effect.runPromise(
      pipe(
        postsStream,
        Stream.take(PAGING_MAX_COUNT),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk])
      )
    );

    postPagingTest(posts);
  }, TEST_TIMEOUT);

  test("saved paging", async () => {
    if (!sessionAvailable) {
      console.log("Skipping: No session available");
      return;
    }

    const profile = await Effect.runPromise(profileOwnProfile(ctx));
    const username = profileUsername(profile);
    console.log(`Getting saved posts for ${username}`);

    const savedStream = await Effect.runPromise(
      profileGetSavedPostsStream(
        ctx,
        profile,
        (node: JsonNode) => postFromNodeSync(node)
      )
    );

    const savedPosts = await Effect.runPromise(
      pipe(
        savedStream,
        Stream.take(PAGING_MAX_COUNT),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk])
      )
    );

    let count = 0;
    for (const post of savedPosts) {
      console.log(postToString(post));
      count++;
      if (count >= PAGING_MAX_COUNT) break;
    }
  }, TEST_TIMEOUT);
});
