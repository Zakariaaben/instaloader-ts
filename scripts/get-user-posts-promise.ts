#!/usr/bin/env bun
import {
  Instaloader,
  isErr,
  isSome,
} from "../src/index.ts";

const SESSION_USERNAME = "zakaria_._ben";
const USERNAME = "rifka.bjm";
const MAX_POSTS = 10;

async function main() {
  const loaderResult = await Instaloader.create({ quiet: false });
  if (isErr(loaderResult)) {
    console.error("Failed to create Instaloader");
    process.exit(1);
  }
  const loader = loaderResult.value;

  const sessionResult = await loader.loadSession(SESSION_USERNAME);
  if (isErr(sessionResult)) {
    console.error("Failed to load session:", sessionResult.error);
    console.log("Continuing without authentication...\n");
  } else {
    console.log(`Loaded session for @${SESSION_USERNAME}`);
    console.log(`Logged in: ${await loader.isLoggedIn()}\n`);
  }

  console.log(`Fetching posts from @${USERNAME}...\n`);

  const profileResult = await loader.getProfile(USERNAME);

  if (isErr(profileResult)) {
    console.error("Failed to get profile:", profileResult.error);
    process.exit(1);
  }
  const profile = profileResult.value;

  console.log(`Profile: ${profile.username}`);
  console.log(`Followers: ${isSome(profile.followers) ? profile.followers.value : "N/A"}`);
  console.log(`Following: ${isSome(profile.followees) ? profile.followees.value : "N/A"}`);
  console.log(`Posts: ${isSome(profile.mediacount) ? profile.mediacount.value : "N/A"}`);
  console.log(`Private: ${isSome(profile.isPrivate) ? profile.isPrivate.value : "N/A"}`);
  console.log(`Verified: ${isSome(profile.isVerified) ? profile.isVerified.value : "N/A"}`);
  console.log("");

  const posts = profile.getPosts();
  let count = 0;

  for await (const postResult of posts) {
    if (isErr(postResult)) {
      console.error("Error fetching post:", postResult.error);
      continue;
    }
    const post = postResult.value;

    console.log(`[${count + 1}] ${post.shortcode}`);
    const dateStr = isSome(post.dateUtc) ? post.dateUtc.value.toISOString() : "N/A";
    console.log(`    Date: ${dateStr}`);
    console.log(`    Type: ${post.typename}`);
    console.log(`    Likes: ${isSome(post.likes) ? post.likes.value : "N/A"}`);
    console.log(`    Comments: ${isSome(post.comments) ? post.comments.value : "N/A"}`);

    if (post.caption) {
      const shortCaption = post.caption.length > 80 ? post.caption.slice(0, 80) + "..." : post.caption;
      console.log(`    Caption: ${shortCaption.replace(/\n/g, " ")}`);
    }
    console.log("");

    count++;
    if (count >= MAX_POSTS) break;
  }

  console.log(`\nFetched ${count} posts from @${USERNAME}`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
