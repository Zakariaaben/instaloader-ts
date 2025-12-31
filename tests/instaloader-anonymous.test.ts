import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  Instaloader,
  InstaloaderContext,
  Profile,
  Hashtag,
  Post,
} from "../src/index.ts";

const PUBLIC_PROFILE = "selenagomez";
const PUBLIC_PROFILE_ID = 460563723;
const PUBLIC_PROFILE_WITH_IGTV = "natgeo";
const HASHTAG = "kitten";
const PRIVATE_PROFILE = "aandergr";
const PRIVATE_PROFILE_ID = 1706625676;
const EMPTY_PROFILE = "not_public";
const EMPTY_PROFILE_ID = 1928659031;
const NORMAL_MAX_COUNT = 2;
const PAGING_MAX_COUNT = 15;

describe("Instaloader Anonymous Tests", () => {
  let L: Instaloader;
  let testDir: string;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "instaloader-test-"));
    console.log(`Testing in ${testDir}`);
    process.chdir(testDir);
    L = new Instaloader({
      downloadGeotags: true,
      downloadComments: true,
      saveMetadata: true,
    });
    L.context.raiseAllErrors = true;
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

  test("get id by username", async () => {
    const profile = await Profile.fromUsername(L.context, PUBLIC_PROFILE);
    expect(profile.userid).toBe(PUBLIC_PROFILE_ID);
  });

  test("get username by id (private)", async () => {
    const profile = await Profile.fromId(L.context, PRIVATE_PROFILE_ID);
    expect(profile.username).toBe(PRIVATE_PROFILE.toLowerCase());
  });

  test("get username by id (public)", async () => {
    const profile = await Profile.fromId(L.context, PUBLIC_PROFILE_ID);
    expect(profile.username).toBe(PUBLIC_PROFILE.toLowerCase());
  });

  test("get username by id (empty)", async () => {
    const profile = await Profile.fromId(L.context, EMPTY_PROFILE_ID);
    expect(profile.username).toBe(EMPTY_PROFILE.toLowerCase());
  });

  test("get username by name (empty)", async () => {
    const profile = await Profile.fromUsername(L.context, EMPTY_PROFILE);
    expect(profile.userid).toBe(EMPTY_PROFILE_ID);
  });

  test("public profile paging", async () => {
    const profile = await Profile.fromUsername(L.context, PUBLIC_PROFILE);
    await postPagingTest(profile.getPosts());
  });

  test("post from mediaid", async () => {
    const profile = await Profile.fromUsername(L.context, PUBLIC_PROFILE);
    for await (const post of profile.getPosts()) {
      const post2 = await Post.fromMediaid(L.context, post.mediaid);
      expect(post.shortcode).toBe(post2.shortcode);
      break;
    }
  });

  test("public profile tagged paging", async () => {
    const profile = await Profile.fromUsername(L.context, PUBLIC_PROFILE);
    let count = 0;
    for await (const post of profile.getTaggedPosts()) {
      console.log(post.toString());
      count++;
      if (count >= PAGING_MAX_COUNT) break;
    }
  });

  test("public profile igtv", async () => {
    const profile = await Profile.fromUsername(
      L.context,
      PUBLIC_PROFILE_WITH_IGTV,
    );
    let count = 0;
    for await (const post of profile.getIgtvPosts()) {
      console.log(post.toString());
      count++;
      if (count >= PAGING_MAX_COUNT) break;
    }
  });

  test("hashtag paging", async () => {
    const hashtag = await Hashtag.fromName(L.context, HASHTAG);
    let count = 0;
    for await (const post of hashtag.getPosts()) {
      console.log(post.toString());
      count++;
      if (count >= PAGING_MAX_COUNT) break;
    }
  });

  test.skip("hashtag download", async () => {
    await L.downloadHashtag(HASHTAG, { maxCount: NORMAL_MAX_COUNT });
  });

  test.skip("profile pic download", async () => {
    const profile = await Profile.fromUsername(L.context, PUBLIC_PROFILE);
    await L.downloadProfile(profile, { posts: false });
  });

  test.skip("public profile download", async () => {
    const profile = await Profile.fromUsername(L.context, PUBLIC_PROFILE);
    await L.downloadProfile(profile, {
      profilePic: false,
      fastUpdate: true,
    });
    await L.downloadProfile(profile, {
      profilePic: false,
      fastUpdate: true,
    });
  });
});
