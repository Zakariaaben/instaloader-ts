# instaloader-ts

A TypeScript port of the popular [Instaloader](https://github.com/instaloader/instaloader) Python library. This library allows you to download Instagram pictures, videos, stories, highlights, and metadata.

> **Note**: This is an unofficial port and is not affiliated with Instagram or the original Instaloader project.

## Features

- **Dual API Design**: Choose between Promise-based client API or Effect-based functional API
- **Full Type Safety**: Result and Option types preserve error information in return signatures
- **Download Media**: Posts, videos, stories, highlights, reels, and sidecars
- **Metadata**: Fetch profile info, captions, comments, likes, and more
- **Authentication**: Support for login, Two-Factor Authentication (2FA), and session management
- **Session Handling**: Load/save sessions programmatically or import Firefox cookies
- **High Performance**: Built on [Bun](https://bun.sh) for speed

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

### Promise-based API (Recommended)

The default export provides a clean, Promise-based API with full type safety using `Result` and `Option` types.

```typescript
import { 
  Instaloader, 
  isErr, 
  isSome,
  type SessionData 
} from "instaloader-ts";

async function main() {
  // Create client
  const loaderResult = await Instaloader.create({ quiet: false });
  if (isErr(loaderResult)) {
    console.error("Failed to create Instaloader");
    return;
  }
  const loader = loaderResult.value;

  // Fetch a profile
  const profileResult = await loader.getProfile("instagram");
  if (isErr(profileResult)) {
    console.error("Error:", profileResult.error._tag);
    return;
  }
  
  const profile = profileResult.value;
  console.log(`Username: ${profile.username}`);
  console.log(`Followers: ${isSome(profile.followers) ? profile.followers.value : "N/A"}`);
  console.log(`Posts: ${isSome(profile.mediacount) ? profile.mediacount.value : "N/A"}`);

  // Iterate over posts with type-safe error handling
  for await (const postResult of profile.getPosts()) {
    if (isErr(postResult)) {
      console.error("Error fetching post:", postResult.error._tag);
      continue;
    }
    
    const post = postResult.value;
    console.log(`Post: ${post.shortcode}`);
    console.log(`  Likes: ${isSome(post.likes) ? post.likes.value : "N/A"}`);
    console.log(`  Type: ${post.typename}`);
    
    // Break after a few posts
    break;
  }
}

main();
```

### Effect-based API (Advanced)

For users who prefer functional programming with Effect:

```typescript
import { Effect, Stream, pipe, Option } from "effect";
import {
  makeInstaloaderContext,
  profileFromUsername,
  profileUsername,
  profileFollowers,
  profileGetPostsStream,
  postFromNodeSync,
  postShortcode,
  type ProfileData,
  type JsonNode,
} from "instaloader-ts/effect";

const program = Effect.gen(function* () {
  const ctx = yield* makeInstaloaderContext({ quiet: false });
  
  const profile = yield* profileFromUsername(ctx, "instagram");
  
  console.log(`Username: ${profileUsername(profile)}`);
  const followers = profileFollowers(profile);
  console.log(`Followers: ${Option.isSome(followers) ? followers.value : "N/A"}`);
  
  // Get posts stream
  const postsStream = yield* profileGetPostsStream(
    ctx,
    profile,
    (node: JsonNode, _profile: ProfileData) => postFromNodeSync(node)
  );
  
  // Process first 5 posts
  const posts = yield* pipe(
    postsStream,
    Stream.take(5),
    Stream.runCollect,
    Effect.map((chunk) => [...chunk])
  );
  
  for (const post of posts) {
    console.log(`Post: ${postShortcode(post)}`);
  }
  
  yield* ctx.close;
});

Effect.runPromise(program);
```

## API Reference

### Instaloader Class (Promise API)

The main client class for interacting with Instagram.

#### Creating an Instance

```typescript
const result = await Instaloader.create(options?: InstaloaderOptions);
```

**Options:**
- `sleep?: boolean` - Enable rate-limit sleep between requests (default: true)
- `quiet?: boolean` - Suppress log output (default: false)
- `userAgent?: string` - Custom user agent string
- `maxConnectionAttempts?: number` - Maximum retry attempts (default: 3)
- `requestTimeout?: number` - Request timeout in ms (default: 300000)
- `iphoneSupport?: boolean` - Enable iPhone API support (default: true)

#### Authentication

```typescript
// Login with credentials
const loginResult = await loader.login(username, password);

// Complete 2FA
const twoFactorResult = await loader.twoFactorLogin(code);

// Check login status
const isLoggedIn = await loader.isLoggedIn();

// Get current username
const username = await loader.getUsername();

// Test if session is valid
const testResult = await loader.testLogin();
```

#### Session Management

```typescript
// Load session data
await loader.loadSessionData(username, sessionData);

// Get current session data (for saving)
const sessionResult = await loader.getSessionData();
```

#### Fetching Data

```typescript
// Get profile by username
const profileResult = await loader.getProfile(username);

// Get profile by ID
const profileResult = await loader.getProfileById(profileId);

// Get your own profile (requires login)
const ownProfileResult = await loader.getOwnProfile();

// Get post by shortcode
const postResult = await loader.getPost(shortcode);

// Get post by media ID
const postResult = await loader.getPostByMediaId(mediaid);

// Get hashtag
const hashtagResult = await loader.getHashtag(name);

// Get stories (requires login)
const storiesResult = await loader.getStories(userIds?);

// Get highlights (requires login)
const highlightsResult = await loader.getHighlights(userIdOrProfile);

// Get feed posts (requires login)
const feedResult = await loader.getFeedPosts();
```

### Profile Interface

```typescript
interface Profile {
  readonly userid: number;
  readonly username: string;
  readonly fullName: Option<string>;
  readonly biography: Option<string>;
  readonly followers: Option<number>;
  readonly followees: Option<number>;
  readonly mediacount: Option<number>;
  readonly isPrivate: Option<boolean>;
  readonly isVerified: Option<boolean>;
  readonly profilePicUrl: Option<string>;
  readonly externalUrl: Option<string | null>;
  readonly isBusinessAccount: Option<boolean>;
  readonly businessCategoryName: Option<string>;
  readonly biographyHashtags: string[];
  readonly biographyMentions: string[];
  readonly followedByViewer: Option<boolean>;
  readonly followsViewer: Option<boolean>;
  
  // Methods returning iterables
  getPosts(): TypedAsyncIterable<PostError, Post>;
  getTaggedPosts(): TypedAsyncIterable<PostError, Post>;
  getReels(): TypedAsyncIterable<PostError, Post>;
  getIgtvPosts(): TypedAsyncIterable<PostError, Post>;
  getSavedPosts(): Promise<Result<LoginRequiredError, TypedAsyncIterable<PostError, Post>>>;
  getProfilePicUrl(): Promise<Result<ProfileFetchError, string>>;
  getHasPublicStory(): Promise<Result<ProfileFetchError, boolean>>;
}
```

### Post Interface

```typescript
interface Post {
  readonly shortcode: string;
  readonly mediaid: number;
  readonly typename: string;  // "GraphImage" | "GraphVideo" | "GraphSidecar"
  readonly url: string;
  readonly caption: string | null;
  readonly likes: Option<number>;
  readonly comments: Option<number>;
  readonly isVideo: boolean;
  readonly dateUtc: Option<Date>;
  readonly dateLocal: Option<Date>;
  readonly title: string | null;
  readonly videoUrl: Option<string>;
  readonly videoViewCount: Option<number>;
  readonly videoDuration: Option<number>;
  readonly mediacount: number;
  readonly isSponsored: boolean;
  readonly isPinned: boolean;
  readonly captionHashtags: string[];
  readonly captionMentions: string[];
  readonly taggedUsers: string[];
  readonly ownerUsername: Option<string>;
  readonly ownerId: Option<number>;
  
  // Async methods
  getSidecarNodes(start?, end?): Promise<Result<PostError, SidecarNode[]>>;
  getVideoUrl(): Promise<Result<PostError, string | null>>;
  getLocation(): Promise<Result<PostError | LoginRequiredError, PostLocation | null>>;
  getOwnerProfile(): Promise<Result<PostError, Profile>>;
}
```

### Result Type

A discriminated union for type-safe error handling:

```typescript
type Result<E, A> = Ok<A> | Err<E>;

// Check success/failure
if (isOk(result)) {
  console.log(result.value);
}
if (isErr(result)) {
  console.log(result.error._tag);
}

// Or use the boolean properties
if (result.ok) {
  console.log(result.value);
}

// Pattern matching
const value = match(result, {
  ok: (value) => value,
  err: (error) => defaultValue,
});
```

### Option Type

For optional values (not errors):

```typescript
type Option<A> = Some<A> | None;

// Check presence
if (isSome(option)) {
  console.log(option.value);
}

// Get with default
const value = getOrElse(option, defaultValue);
```

### TypedAsyncIterable

Type-safe async iteration with error preservation:

```typescript
const posts = profile.getPosts();

// Iterate with error handling
for await (const result of posts) {
  if (isErr(result)) {
    console.error(result.error._tag);
    continue;
  }
  console.log(result.value.shortcode);
}

// Collect all (stops on first error)
const allResult = await posts.collect();

// Take first N items
const firstTen = await posts.take(10);

// Transform
const shortcodes = posts.map(post => post.shortcode);
const videos = posts.filter(post => post.isVideo);
```

### Error Types

All errors extend `InstaloaderBaseError` and have a `_tag` property for discrimination:

```typescript
// Authentication errors
type AuthenticationError =
  | LoginRequiredError
  | LoginError
  | TwoFactorAuthRequiredError
  | BadCredentialsError;

// Connection errors
type ConnectionErrors =
  | ConnectionError
  | TooManyRequestsError;

// Query errors
type QueryError =
  | QueryReturnedBadRequestError
  | QueryReturnedForbiddenError
  | QueryReturnedNotFoundError;

// Profile errors  
type ProfileError =
  | ProfileNotExistsError
  | ProfileHasNoPicsError
  | PrivateProfileNotFollowedError;

// Type guards available
isAuthenticationError(error)
isConnectionError(error)
isQueryError(error)
isProfileError(error)
```

## Example Scripts

The `scripts/` directory contains example usage:

### Login & Save Session
```bash
bun run scripts/login.ts <username>
# Prompts for password and handles 2FA
```

### Fetch User Posts (Promise API)
```bash
bun run scripts/get-user-posts-promise.ts
# Uses the Promise-based client API
```

### Fetch User Posts (Effect API)
```bash
bun run scripts/get-user-posts.ts
# Uses the Effect-based API
```

### Import Firefox Cookies
```bash
bun run scripts/import-firefox-cookies.ts
# Imports session from Firefox cookies database
```

## Development

```bash
# Run tests
bun test

# Type check
bun run typecheck

# Lint code
bun run lint

# Format code
bun run format
```

## Package Exports

The package supports multiple entry points:

```typescript
// Default: Promise-based client API
import { Instaloader, Result, Option } from "instaloader-ts";

// Effect-based API
import { makeInstaloaderContext, profileFromUsername } from "instaloader-ts/effect";

// Error classes only
import { ProfileNotExistsError, ConnectionError } from "instaloader-ts/errors";
```

## Disclaimer

This tool is for educational purposes only. Do not use it to violate Instagram's Terms of Service. The authors are not responsible for any misuse of this tool or any account bans that may result from its use.

## Credits

This project is a TypeScript port of [Instaloader](https://github.com/instaloader/instaloader). Huge thanks to the original maintainers for their excellent work on the logic and reverse-engineering of the Instagram API.

## License

MIT
