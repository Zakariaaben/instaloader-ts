#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { Effect, Stream, pipe, Option } from "effect";
import {
  makeInstaloaderContext,
  profileFromUsername,
  profileUsername,
  profileFollowees,
  profileFollowers,
  profileMediacount,
  profileIsPrivate,
  profileIsVerified,
  profileGetPostsStream,
  postFromNodeSync,
  postShortcode,
  postDateUtc,
  postTypename,
  postLikes,
  postComments,
  postCaption,
  type ProfileData,
  type JsonNode,
  type CookieJar,
} from "../src/index.ts";

const USERNAME = "rifka.bjm";
const MAX_POSTS = 20;

function getSessionPath(username: string): string {
  const configDir = process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");
  return join(configDir, "instaloader", `session-${username}`);
}

async function loadSessionFromFile(username: string): Promise<CookieJar | null> {
  try {
    const sessionPath = getSessionPath(username);
    const data = await readFile(sessionPath, "utf-8");
    return JSON.parse(data) as CookieJar;
  } catch {
    return null;
  }
}

async function main() {
  const program = Effect.gen(function* () {
    const ctx = yield* makeInstaloaderContext({ quiet: false });

    const sessionData = yield* Effect.promise(() => loadSessionFromFile("zakaria_._ben"));
    if (sessionData) {
      yield* ctx.loadSession("zakaria_._ben", sessionData);
      console.log("Session loaded\n");
    } else {
      console.log("No session file found, running anonymously\n");
    }

    console.log(`Fetching posts from @${USERNAME}...\n`);

    const profile = yield* profileFromUsername(ctx, USERNAME);

    const username = profileUsername(profile);
    const followeesOpt = profileFollowees(profile);
    const followersOpt = profileFollowers(profile);
    const mediacountOpt = profileMediacount(profile);
    const isPrivateOpt = profileIsPrivate(profile);
    const isVerifiedOpt = profileIsVerified(profile);

    console.log(`Profile: ${username}`);
    console.log(`Followers: ${Option.isSome(followersOpt) ? followersOpt.value : "N/A"}`);
    console.log(`Following: ${Option.isSome(followeesOpt) ? followeesOpt.value : "N/A"}`);
    console.log(`Posts: ${Option.isSome(mediacountOpt) ? mediacountOpt.value : "N/A"}`);
    console.log(`Private: ${Option.isSome(isPrivateOpt) ? isPrivateOpt.value : "N/A"}`);
    console.log(`Verified: ${Option.isSome(isVerifiedOpt) ? isVerifiedOpt.value : "N/A"}`);
    console.log("");

    const postsStream = yield* profileGetPostsStream(
      ctx,
      profile,
      (node: JsonNode, _profileData: ProfileData) => postFromNodeSync(node)
    );

    const posts = yield* pipe(
      postsStream,
      Stream.take(MAX_POSTS),
      Stream.runCollect,
      Effect.map((chunk) => [...chunk])
    );

    let count = 0;
    for (const post of posts) {
      console.log(`[${count + 1}] ${postShortcode(post)}`);
      const dateUtcOpt = postDateUtc(post);
      const dateStr = Option.isSome(dateUtcOpt) ? dateUtcOpt.value.toISOString() : "N/A";
      console.log(`    Date: ${dateStr}`);
      console.log(`    Type: ${postTypename(post)}`);
      console.log(`    Likes: ${postLikes(post)}`);
      console.log(`    Comments: ${postComments(post)}`);

      const caption = postCaption(post);
      if (caption) {
        const shortCaption = caption.length > 80 ? caption.slice(0, 80) + "..." : caption;
        console.log(`    Caption: ${shortCaption.replace(/\n/g, " ")}`);
      }
      console.log("");

      count++;
    }

    console.log(`\nFetched ${count} posts from @${USERNAME}`);

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
