#!/usr/bin/env bun
import { Instaloader, Profile, getDefaultSessionFilename } from "../src/index.ts";
import * as fs from "fs";

const USERNAME = "rifka.bjm";
const MAX_POSTS = 10;

async function main() {
  const loader = new Instaloader({ quiet: false });

  try {
    const sessionFile = getDefaultSessionFilename("zakaria_._ben");
    if (fs.existsSync(sessionFile)) {
      await loader.loadSessionFromFile("zakaria_._ben");
      console.log("Session loaded\n");
    } else {
      console.log("No session file found, running anonymously\n");
    }

    console.log(`Fetching posts from @${USERNAME}...\n`);

    const profile = await Profile.fromUsername(loader.context, USERNAME);
    
    console.log(`Profile: ${profile.username}`);
    console.log(`Full name: ${await profile.getFullName()}`);
    console.log(`Followers: ${await profile.getFollowers()}`);
    console.log(`Following: ${await profile.getFollowees()}`);
    console.log(`Posts: ${await profile.getMediacount()}`);
    console.log(`Private: ${await profile.getIsPrivate()}`);
    console.log(`Verified: ${await profile.getIsVerified()}`);
    console.log("");

    let count = 0;
    for await (const post of profile.getPosts()) {
      console.log(`[${count + 1}] ${post.shortcode}`);
      console.log(`    Date: ${post.dateUtc.toISOString()}`);
      console.log(`    Type: ${post.typename}`);
      console.log(`    Likes: ${post.likes}`);
      console.log(`    Comments: ${post.comments}`);
      
      const caption = post.caption;
      if (caption) {
        const shortCaption = caption.length > 80 ? caption.slice(0, 80) + "..." : caption;
        console.log(`    Caption: ${shortCaption.replace(/\n/g, " ")}`);
      }
      console.log("");

      count++;
      if (count >= MAX_POSTS) {
        console.log(`Reached ${MAX_POSTS} posts limit.`);
        break;
      }
    }

    console.log(`\nFetched ${count} posts from @${USERNAME}`);
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    loader.close();
  }
}

main();
