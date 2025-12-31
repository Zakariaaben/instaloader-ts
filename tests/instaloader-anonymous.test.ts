import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Effect, Stream, pipe, Option } from "effect";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  makeInstaloaderContext,
  profileFromUsername,
  profileFromId,
  profileUserid,
  profileUsername,
  profileGetPostsStream,
  profileGetTaggedPostsStream,
  profileGetIgtvPostsStream,
  postFromMediaidEffect,
  postShortcode,
  postMediaid,
  postDateUtc,
  postToString,
  hashtagFromNameEffect,
  hashtagGetPostsStream,
  postFromNodeSync,
  type InstaloaderContextShape,
  type JsonNode,
  type PostData,
  type ProfileData,
} from "../src/index.ts";

const PUBLIC_PROFILE = "selenagomez";
const PUBLIC_PROFILE_ID = 460563723;
const PUBLIC_PROFILE_WITH_IGTV = "natgeo";
const HASHTAG = "kitten";
const PRIVATE_PROFILE = "aandergr";
const PRIVATE_PROFILE_ID = 1706625676;
const EMPTY_PROFILE = "not_public";
const EMPTY_PROFILE_ID = 1928659031;
const PAGING_MAX_COUNT = 15;

describe("Instaloader Anonymous Tests", () => {
  let ctx: InstaloaderContextShape;
  let testDir: string;

  beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "instaloader-test-"));
    console.log(`Testing in ${testDir}`);
    process.chdir(testDir);
    
    ctx = await Effect.runPromise(makeInstaloaderContext({
      quiet: false,
      sleep: true,
    }));
  });

  afterAll(async () => {
    await Effect.runPromise(ctx.close);
    process.chdir("/");
    console.log(`Removing ${testDir}`);
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function postPagingTest(posts: PostData[]): void {
    let previousPost: PostData | null = null;
    for (const post of posts) {
      console.log(postToString(post));
      if (previousPost) {
        const currentDate = Option.getOrThrow(postDateUtc(post));
        const previousDate = Option.getOrThrow(postDateUtc(previousPost));
        expect(currentDate.getTime()).toBeLessThan(previousDate.getTime());
      }
      previousPost = post;
    }
  }

  test("get id by username", async () => {
    const profile = await Effect.runPromise(profileFromUsername(ctx, PUBLIC_PROFILE));
    expect(profileUserid(profile)).toBe(PUBLIC_PROFILE_ID);
  });

  test("get username by id (private)", async () => {
    const profile = await Effect.runPromise(profileFromId(ctx, PRIVATE_PROFILE_ID));
    expect(profileUsername(profile)).toBe(PRIVATE_PROFILE.toLowerCase());
  });

  test("get username by id (public)", async () => {
    const profile = await Effect.runPromise(profileFromId(ctx, PUBLIC_PROFILE_ID));
    expect(profileUsername(profile)).toBe(PUBLIC_PROFILE.toLowerCase());
  });

  test("get username by id (empty)", async () => {
    const profile = await Effect.runPromise(profileFromId(ctx, EMPTY_PROFILE_ID));
    expect(profileUsername(profile)).toBe(EMPTY_PROFILE.toLowerCase());
  });

  test("get username by name (empty)", async () => {
    const profile = await Effect.runPromise(profileFromUsername(ctx, EMPTY_PROFILE));
    expect(profileUserid(profile)).toBe(EMPTY_PROFILE_ID);
  });

  test("public profile paging", async () => {
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
  });

  test("post from mediaid", async () => {
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
        Stream.take(1),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk])
      )
    );
    
    const post = posts[0];
    if (post) {
      const postData: PostData = await Effect.runPromise(
        postFromMediaidEffect(ctx, postMediaid(post))
      );
      expect(postShortcode(post)).toBe(postShortcode(postData));
    }
  });

  test("public profile tagged paging", async () => {
    const profile = await Effect.runPromise(profileFromUsername(ctx, PUBLIC_PROFILE));
    
    const taggedStream = profileGetTaggedPostsStream(
      ctx,
      profile,
        (node: JsonNode, _ownerProfile: ProfileData | null) => postFromNodeSync(node)
    );
    
    const posts = await Effect.runPromise(
      pipe(
        taggedStream,
        Stream.take(PAGING_MAX_COUNT),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk])
      )
    );
    
    let count = 0;
    for (const post of posts) {
      console.log(postToString(post));
      count++;
      if (count >= PAGING_MAX_COUNT) break;
    }
  });

  test("public profile igtv", async () => {
    const profile = await Effect.runPromise(
      profileFromUsername(ctx, PUBLIC_PROFILE_WITH_IGTV)
    );
    
    const igtvStream = profileGetIgtvPostsStream(
      ctx,
      profile,
        (node: JsonNode, _ownerProfile: ProfileData | null) => postFromNodeSync(node)
    );
    
    const posts = await Effect.runPromise(
      pipe(
        igtvStream,
        Stream.take(PAGING_MAX_COUNT),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk])
      )
    );
    
    let count = 0;
    for (const post of posts) {
      console.log(postToString(post));
      count++;
      if (count >= PAGING_MAX_COUNT) break;
    }
  });

  test("hashtag paging", async () => {
    const hashtag = await Effect.runPromise(hashtagFromNameEffect(ctx, HASHTAG));
    
    const postsStream = await Effect.runPromise(
      hashtagGetPostsStream(ctx, hashtag)
    );
    
    const postDataList = await Effect.runPromise(
      pipe(
        postsStream,
        Stream.take(PAGING_MAX_COUNT),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk])
      )
    );
    
    let count = 0;
    for (const postData of postDataList) {
      console.log(`Post: ${postShortcode(postData)}`);
      count++;
      if (count >= PAGING_MAX_COUNT) break;
    }
  });
});
