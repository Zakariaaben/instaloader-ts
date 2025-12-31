# instaloader-ts

A TypeScript port of the popular [Instaloader](https://github.com/instaloader/instaloader) Python library. This library allows you to download Instagram pictures, videos, stories, highlights, and metadata.

> **Note**: This is an unofficial port and is not affiliated with Instagram or the original Instaloader project.

## Features

- **Download Media**: Posts, videos, stories, highlights, reels, and sidecars.
- **Metadata**: Fetch profile info, captions, comments, likes, and more.
- **Authentication**: Support for login, Two-Factor Authentication (2FA), and session management.
- **Session Handling**: Load/save sessions to files or import Firefox cookies.
- **High Performance**: Built on [Bun](https://bun.sh) for speed.

## Prerequisites

- [Bun](https://bun.sh) runtime (v1.0 or later)

## Installation

```bash
# Clone the repository
git clone https://github.com/zakariaaben/instaloader-ts.git
cd instaloader-ts

# Install dependencies
bun install
```

## Quick Start

### Basic Usage (Anonymous)

You can use `Instaloader` anonymously for public profiles, but some data may be restricted.

```typescript
import { Instaloader, Profile } from "./src/index";

async function main() {
  const loader = new Instaloader();
  const username = "instagram";

  console.log(`Fetching profile @${username}...`);
  const profile = await Profile.fromUsername(loader.context, username);

  console.log(`Followers: ${await profile.getFollowers()}`);
  console.log(`Posts: ${await profile.getMediacount()}`);

  // Iterate over posts
  for await (const post of profile.getPosts()) {
    console.log(`Post: ${post.shortcode} - Likes: ${post.likes}`);
    // Break after 5 posts to avoid hitting limits
    break; 
  }
}

main();
```

### Logging In

Login is required for viewing private profiles, stories, and avoiding strict rate limits.

```typescript
import { Instaloader } from "./src/index";

const loader = new Instaloader();

try {
  await loader.login("your_username", "your_password");
  console.log("Logged in successfully!");
  
  // Save session for future use
  await loader.saveSessionToFile();
} catch (error) {
  if (error.name === "TwoFactorAuthRequiredException") {
    // Handle 2FA
    await loader.twoFactorLogin("123456"); 
  }
}
```

## API Overview

### `Instaloader`

The main class that handles the connection and configuration.

- `new Instaloader(options)`: Initialize the loader. Options include `downloadVideos`, `downloadGeotags`, `saveMetadata`, etc.
- `loader.login(user, pass)`: Login to Instagram.
- `loader.loadSessionFromFile(username)`: Restore a previous session.
- `loader.saveSessionToFile(filename)`: Save current session.
- `loader.downloadPost(post, target)`: Download a post to a target directory.
- `loader.downloadProfile(profile, options)`: Download entire profile content.
- `loader.getStories(userids)`: Get stories for specified user IDs (requires login).
- `loader.getHighlights(profile)`: Get highlights for a profile (requires login).

### `Profile`

Represents an Instagram user profile.

- `Profile.fromUsername(context, username)`: Fetch a profile.
- `profile.getPosts()`: Returns an iterator of `Post` objects.
- `profile.getReels()`: Returns an iterator of reels.
- `profile.getTaggedPosts()`: Returns an iterator of posts where the user is tagged.
- `profile.getIgtvPosts()`: Returns an iterator of IGTV posts.

### `Post`

Represents a single media post (image, video, or sidecar).

- `post.url`: The URL of the media.
- `post.caption`: The post caption.
- `post.likes`: Like count.
- `post.comments`: Comment count.
- `post.typename`: "GraphImage", "GraphVideo", or "GraphSidecar".
- `post.getVideoUrl()`: Get video URL if it's a video.
- `post.getSidecarNodes()`: Get children nodes if it's a sidecar (carousel).

## Scripts

This project includes several utility scripts in the `scripts/` directory:

### Login & Save Session
```bash
bun run scripts/login.ts <username>
# Prompts for password and handles 2FA
```

### Fetch User Posts
```bash
# Edit the script to change target username first
bun run scripts/get-user-posts.ts
```

### Import Firefox Cookies
Import cookies from a Firefox session to avoid logging in directly.
```bash
# Automatically finds Firefox cookies database and imports session
bun run scripts/import-firefox-cookies.ts
```

## Development

```bash
# Run tests
bun test

# Lint code
bun run lint

# Format code
bun run format
```

## Disclaimer

This tool is for educational purposes only. Do not use it to violate Instagram's Terms of Service. The authors are not responsible for any misuse of this tool or any account bans that may result from its use.

## Credits

This project is a TypeScript port of [Instaloader](https://github.com/instaloader/instaloader). Huge thanks to the original maintainers for their excellent work on the logic and reverse-engineering of the Instagram API.

## License

MIT
