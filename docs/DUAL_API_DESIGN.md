# Dual API Design: Effect + Non-Effect

> **Status**: ✅ **IMPLEMENTED** - Both APIs are fully functional
>
> **Goal**: Expose both Effect and non-Effect APIs so end users can choose their preferred style while maintaining **full type safety** for results and errors.

## Table of Contents

1. [Design Principles](#design-principles)
2. [Architecture Overview](#architecture-overview)
3. [Package Entry Points](#package-entry-points)
4. [Type Definitions](#type-definitions)
5. [Error System](#error-system)
6. [API Surface](#api-surface)
7. [Stream Handling](#stream-handling)
8. [Implementation Status](#implementation-status)
9. [Migration Guide](#migration-guide)
10. [File Structure](#file-structure)

---

## Design Principles

1. **Zero Effect dependency for non-Effect users** - Users who don't want Effect shouldn't need to install or import it
2. **Full type safety** - Error types are preserved in return signatures (`Result<ProfileNotExistsError | ConnectionError, ProfileData>`)
3. **Familiar patterns** - Non-Effect API uses standard Promises and pattern matching
4. **No runtime overhead** - Non-Effect wrappers are thin layers over Effect internals
5. **Consistent behavior** - Both APIs have identical functionality, just different interfaces
6. **Discoverable API** - Client class provides good IDE autocomplete and documentation

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Code                                │
├────────────────────────────┬────────────────────────────────────┤
│      Non-Effect Users      │         Effect Users               │
│                            │                                    │
│  import { Instaloader }    │  import { makeInstaloaderContext,  │
│    from "instaloader-ts"   │    profileFromUsername }           │
│                            │    from "instaloader-ts/effect"    │
│                            │                                    │
│  const result = await      │  const program = Effect.gen(       │
│    Instaloader.create()    │    function* () {                  │
│  const loader = result.val │      const ctx = yield*            │
│                            │        makeInstaloaderContext()    │
│  const profile = await     │      const profile = yield*        │
│    loader.getProfile(u)    │        profileFromUsername(ctx, u) │
│                            │    }                               │
│  if (profile.ok) {         │  )                                 │
│    console.log(profile.val)│                                    │
│  }                         │                                    │
├────────────────────────────┴────────────────────────────────────┤
│                      Internal Layer                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   src/client/ (IMPLEMENTED)                │ │
│  │  - Instaloader class (wraps context + operations)          │ │
│  │  - Result<E, A> type definitions                           │ │
│  │  - Option<A> type definitions                              │ │
│  │  - Effect-to-Promise converters                            │ │
│  │  - TypedAsyncIterable for streams                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   src/core/ (EXISTING)                     │ │
│  │  - Effect-based implementations                            │ │
│  │  - Context management                                      │ │
│  │  - All business logic                                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                src/errors/ (IMPLEMENTED)                   │ │
│  │  - Plain TypeScript error classes (no Effect dependency)   │ │
│  │  - Tagged with _tag for discrimination                     │ │
│  │  - Union types for error categories                        │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Package Entry Points

### package.json exports (Recommended Configuration)

```json
{
  "name": "instaloader-ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./effect": {
      "types": "./dist/effect/index.d.ts", 
      "import": "./dist/effect/index.js",
      "require": "./dist/effect/index.cjs"
    },
    "./errors": {
      "types": "./dist/errors/index.d.ts",
      "import": "./dist/errors/index.js",
      "require": "./dist/errors/index.cjs"
    }
  }
}
```

### Usage Examples

```typescript
// Non-Effect users (DEFAULT) - Promise-based client API
import { 
  Instaloader, 
  type Result, 
  isOk, 
  isErr,
  type Option,
  isSome,
  isNone 
} from "instaloader-ts";

// Effect users - Full Effect-based API
import { 
  makeInstaloaderContext, 
  profileFromUsername,
  profileGetPostsStream,
  postFromNodeSync,
} from "instaloader-ts/effect";

// Shared error types (both APIs)
import { 
  ProfileNotExistsError, 
  ConnectionError,
  isAuthenticationError 
} from "instaloader-ts/errors";
```

---

## Type Definitions

### Result Type (`src/client/result.ts`) ✅ IMPLEMENTED

```typescript
/**
 * A discriminated union representing either success or failure.
 * Provides full type safety for both the success value and error type.
 */
export type Result<E, A> = Ok<A> | Err<E>;

export interface Ok<A> {
  readonly _tag: "Ok";
  readonly value: A;
  readonly ok: true;
  readonly err: false;
}

export interface Err<E> {
  readonly _tag: "Err";
  readonly error: E;
  readonly ok: false;
  readonly err: true;
}

// Constructors
export const Ok = <A>(value: A): Ok<A> => ({ _tag: "Ok", value, ok: true, err: false });
export const Err = <E>(error: E): Err<E> => ({ _tag: "Err", error, ok: false, err: true });

// Type guards
export const isOk = <E, A>(result: Result<E, A>): result is Ok<A> => result._tag === "Ok";
export const isErr = <E, A>(result: Result<E, A>): result is Err<E> => result._tag === "Err";

// Utility functions (all implemented)
export const map: <E, A, B>(result: Result<E, A>, fn: (a: A) => B) => Result<E, B>;
export const mapErr: <E, A, F>(result: Result<E, A>, fn: (e: E) => F) => Result<F, A>;
export const flatMap: <E, A, F, B>(result: Result<E, A>, fn: (a: A) => Result<F, B>) => Result<E | F, B>;
export const unwrap: <E, A>(result: Result<E, A>) => A;
export const unwrapOr: <E, A>(result: Result<E, A>, defaultValue: A) => A;
export const unwrapErr: <E, A>(result: Result<E, A>) => E;
export const match: <E, A, B>(result: Result<E, A>, handlers: { ok: (a: A) => B; err: (e: E) => B }) => B;
export const fromNullable: <A>(value: A | null | undefined, onNull: () => Error) => Result<Error, A>;
export const tryCatch: <A, E>(fn: () => A, onError: (error: unknown) => E) => Result<E, A>;
export const tryCatchAsync: <A, E>(fn: () => Promise<A>, onError: (error: unknown) => E) => Promise<Result<E, A>>;
export const all: <E, A>(results: Result<E, A>[]) => Result<E, A[]>;
export const any: <E, A>(results: Result<E, A>[]) => Result<E[], A>;
```

### Option Type (`src/client/option.ts`) ✅ IMPLEMENTED

```typescript
/**
 * Represents an optional value - either Some(value) or None.
 * Used when a value may or may not be present (not an error case).
 */
export type Option<A> = Some<A> | None;

export interface Some<A> {
  readonly _tag: "Some";
  readonly value: A;
  readonly some: true;
  readonly none: false;
}

export interface None {
  readonly _tag: "None";
  readonly some: false;
  readonly none: true;
}

// Constructors
export const Some = <A>(value: A): Some<A> => ({ _tag: "Some", value, some: true, none: false });
export const None: None = { _tag: "None", some: false, none: true };

// Type guards
export const isSome = <A>(option: Option<A>): option is Some<A> => option._tag === "Some";
export const isNone = <A>(option: Option<A>): option is None => option._tag === "None";

// Utility functions (all implemented)
export const fromNullable: <A>(value: A | null | undefined) => Option<A>;
export const getOrElse: <A>(option: Option<A>, defaultValue: A) => A;
export const getOrElseLazy: <A>(option: Option<A>, getDefault: () => A) => A;
export const map: <A, B>(option: Option<A>, fn: (a: A) => B) => Option<B>;
export const flatMap: <A, B>(option: Option<A>, fn: (a: A) => Option<B>) => Option<B>;
export const filter: <A>(option: Option<A>, predicate: (a: A) => boolean) => Option<A>;
export const match: <A, B>(option: Option<A>, handlers: { some: (a: A) => B; none: () => B }) => B;
export const toNullable: <A>(option: Option<A>) => A | null;
export const toUndefined: <A>(option: Option<A>) => A | undefined;
export const zip: <A, B>(a: Option<A>, b: Option<B>) => Option<readonly [A, B]>;
export const all: <A>(options: Option<A>[]) => Option<A[]>;
```

---

## Error System

### Design: Plain TypeScript Classes ✅ IMPLEMENTED

Errors are **plain TypeScript classes** with a `_tag` property for discrimination. This allows:
- No Effect dependency for error types
- Full TypeScript narrowing support
- Familiar `instanceof` checks
- Pattern matching via `_tag`

### Error Hierarchy (`src/errors/`)

```typescript
// Base class (src/errors/base.ts)
export abstract class InstaloaderBaseError extends Error {
  abstract readonly _tag: ErrorTag;
  readonly cause?: unknown;
  
  constructor(message: string, cause?: unknown);
  toString(): string;
  toJSON(): Record<string, unknown>;
}

// Query errors (src/errors/query.ts)
export class QueryReturnedBadRequestError extends InstaloaderBaseError { _tag = "QueryReturnedBadRequestError" }
export class QueryReturnedForbiddenError extends InstaloaderBaseError { _tag = "QueryReturnedForbiddenError" }
export class QueryReturnedNotFoundError extends InstaloaderBaseError { _tag = "QueryReturnedNotFoundError" }

// Profile errors (src/errors/profile.ts)
export class ProfileNotExistsError extends InstaloaderBaseError { _tag = "ProfileNotExistsError"; username?: string }
export class ProfileHasNoPicsError extends InstaloaderBaseError { _tag = "ProfileHasNoPicsError" }
export class PrivateProfileNotFollowedError extends InstaloaderBaseError { _tag = "PrivateProfileNotFollowedError"; username?: string }

// Auth errors (src/errors/auth.ts)
export class LoginRequiredError extends InstaloaderBaseError { _tag = "LoginRequiredError" }
export class LoginError extends InstaloaderBaseError { _tag = "LoginError" }
export class TwoFactorAuthRequiredError extends InstaloaderBaseError { _tag = "TwoFactorAuthRequiredError"; twoFactorIdentifier?: string }
export class BadCredentialsError extends InstaloaderBaseError { _tag = "BadCredentialsError" }

// Connection errors (src/errors/connection.ts)
export class ConnectionError extends InstaloaderBaseError { _tag = "ConnectionError" }
export class TooManyRequestsError extends InstaloaderBaseError { _tag = "TooManyRequestsError"; retryAfter?: number }

// Response errors (src/errors/response.ts)
export class InvalidArgumentError extends InstaloaderBaseError { _tag = "InvalidArgumentError"; argument?: string }
export class BadResponseError extends InstaloaderBaseError { _tag = "BadResponseError"; response?: unknown }
export class PostChangedError extends InstaloaderBaseError { _tag = "PostChangedError"; shortcode?: string }

// Feature errors (src/errors/feature.ts)
export class IPhoneSupportDisabledError extends InstaloaderBaseError { _tag = "IPhoneSupportDisabledError" }
export class AbortDownloadError extends InstaloaderBaseError { _tag = "AbortDownloadError" }
```

### Error Union Types (src/errors/index.ts)

```typescript
export type QueryError = QueryReturnedBadRequestError | QueryReturnedForbiddenError | QueryReturnedNotFoundError;
export type ProfileError = ProfileNotExistsError | ProfileHasNoPicsError | PrivateProfileNotFollowedError;
export type AuthenticationError = LoginRequiredError | LoginError | TwoFactorAuthRequiredError | BadCredentialsError;
export type ConnectionErrors = ConnectionError | TooManyRequestsError;
export type ResponseError = InvalidArgumentError | BadResponseError | PostChangedError;
export type FeatureError = IPhoneSupportDisabledError | AbortDownloadError;

export type InstaloaderErrors = QueryError | ProfileError | AuthenticationError | ConnectionErrors | ResponseError | FeatureError;

// Type guards
export const isInstaloaderError: (error: unknown) => error is InstaloaderErrors;
export const isAuthenticationError: (error: unknown) => error is AuthenticationError;
export const isConnectionError: (error: unknown) => error is ConnectionErrors;
export const isQueryError: (error: unknown) => error is QueryError;
export const isProfileError: (error: unknown) => error is ProfileError;
export const isAbortDownloadError: (error: unknown) => error is AbortDownloadError;
```

---

## API Surface

### Client Class (`src/client/instaloader.ts`) ✅ IMPLEMENTED

```typescript
export interface InstaloaderOptions {
  sleep?: boolean;           // Enable rate-limit sleep (default: true)
  quiet?: boolean;           // Suppress log output (default: false)
  userAgent?: string;        // Custom user agent
  maxConnectionAttempts?: number;  // Max retries (default: 3)
  requestTimeout?: number;   // Timeout in ms (default: 300000)
  iphoneSupport?: boolean;   // Enable iPhone API (default: true)
}

export class Instaloader {
  // Factory method
  static async create(options?: InstaloaderOptions): Promise<Result<never, Instaloader>>;
  
  // Authentication
  async isLoggedIn(): Promise<boolean>;
  async getUsername(): Promise<string | null>;
  async login(username: string, password: string): Promise<Result<ContextError, void>>;
  async twoFactorLogin(code: string): Promise<Result<ContextError, void>>;
  async testLogin(): Promise<Result<ContextError, string | null>>;
  
  // Session management
  async loadSessionData(username: string, sessionData: SessionData): Promise<Result<never, void>>;
  async getSessionData(): Promise<Result<LoginRequiredError, SessionData>>;
  
  // Profile operations
  async getProfile(username: string): Promise<Result<CreateProfileError, Profile>>;
  async getProfileById(profileId: number): Promise<Result<CreateProfileError, Profile>>;
  async getOwnProfile(): Promise<Result<CreateProfileError | LoginRequiredError, Profile>>;
  
  // Post operations
  async getPost(shortcode: string): Promise<Result<PostError, Post>>;
  async getPostByMediaId(mediaid: number): Promise<Result<PostError, Post>>;
  
  // Stories and highlights (require login)
  async getStories(userids?: number[]): Promise<Result<LoginRequiredError | PostError, Story[]>>;
  async getHighlights(user: number | Profile): Promise<Result<LoginRequiredError | PostError, Highlight[]>>;
  
  // Feed (requires login)
  getFeedPosts(): Promise<Result<LoginRequiredError, TypedAsyncIterable<PostError, Post>>>;
  
  // Hashtag
  async getHashtag(name: string): Promise<Result<PostError, Hashtag>>;
  
  // Access to underlying context for advanced use
  get context(): InstaloaderContextShape;
}
```

### Data Types (`src/client/types.ts`) ✅ IMPLEMENTED

```typescript
export interface Profile {
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
  readonly blockedByViewer: Option<boolean>;
  readonly hasBlockedViewer: Option<boolean>;
  readonly requestedByViewer: Option<boolean>;
  readonly hasRequestedViewer: Option<boolean>;
  
  // Stream methods
  getPosts(): TypedAsyncIterable<PostError, Post>;
  getTaggedPosts(): TypedAsyncIterable<PostError, Post>;
  getReels(): TypedAsyncIterable<PostError, Post>;
  getIgtvPosts(): TypedAsyncIterable<PostError, Post>;
  getSavedPosts(): Promise<Result<LoginRequiredError, TypedAsyncIterable<PostError, Post>>>;
  getProfilePicUrl(): Promise<Result<ProfileFetchError, string>>;
  getHasPublicStory(): Promise<Result<ProfileFetchError, boolean>>;
}

export interface Post {
  readonly shortcode: string;
  readonly mediaid: number;
  readonly typename: string;
  readonly url: string;
  readonly caption: string | null;
  readonly likes: Option<number>;
  readonly comments: Option<number>;
  readonly isVideo: boolean;
  readonly dateUtc: Option<Date>;
  readonly dateLocal: Option<Date>;
  readonly title: string | null;
  readonly accessibilityCaption: string | null;
  readonly captionHashtags: string[];
  readonly captionMentions: string[];
  readonly taggedUsers: string[];
  readonly videoUrl: Option<string>;
  readonly videoViewCount: Option<number>;
  readonly videoDuration: Option<number>;
  readonly mediacount: number;
  readonly isSponsored: boolean;
  readonly isPinned: boolean;
  readonly ownerUsername: Option<string>;
  readonly ownerId: Option<number>;
  
  getSidecarNodes(start?: number, end?: number): Promise<Result<PostError, SidecarNode[]>>;
  getVideoUrl(): Promise<Result<PostError, string | null>>;
  getLocation(): Promise<Result<PostError | LoginRequiredError, PostLocation | null>>;
  getOwnerProfile(): Promise<Result<PostError, Profile>>;
}

export interface StoryItem {
  readonly mediaid: number;
  readonly shortcode: string;
  readonly typename: string;
  readonly url: string;
  readonly isVideo: boolean;
  readonly videoUrl: string | null;
  readonly dateUtc: Date;
  readonly dateLocal: Date;
  readonly expiringUtc: Date;
  readonly caption: string | null;
  readonly captionHashtags: string[];
  readonly captionMentions: string[];
  readonly ownerUsername: Option<string>;
  readonly ownerId: Option<number>;
}

export interface Story {
  readonly ownerUsername: string;
  readonly ownerId: number;
  readonly lastSeenUtc: Date | null;
  readonly latestMediaUtc: Date;
  readonly itemcount: number;
  getItems(): Promise<Result<PostError, StoryItem[]>>;
}

export interface Highlight {
  readonly uniqueId: number;
  readonly title: string;
  readonly coverUrl: string;
  readonly coverCroppedUrl: string;
  readonly ownerUsername: string;
  readonly ownerId: number;
  getItems(): Promise<Result<PostError, StoryItem[]>>;
}

export interface Hashtag {
  readonly name: string;
  getMediacount(): Promise<Result<PostError, number>>;
  getProfilePicUrl(): Promise<Result<PostError, string>>;
  getPosts(): TypedAsyncIterable<PostError, Post>;
  getTopPosts(): TypedAsyncIterable<PostError, Post>;
}

export interface PostLocation {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
  readonly hasPublicPage: boolean | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

export interface SidecarNode {
  readonly displayUrl: string;
  readonly isVideo: boolean;
  readonly videoUrl: string | null;
}
```

---

## Stream Handling

### TypedAsyncIterable (`src/client/async-iterable.ts`) ✅ IMPLEMENTED

```typescript
/**
 * An async iterable that preserves error type information.
 * Each iteration yields a Result<E, A> to maintain type safety.
 */
export interface TypedAsyncIterable<E, A> {
  [Symbol.asyncIterator](): AsyncIterator<Result<E, A>>;
  
  // Collection methods
  collect(): Promise<Result<E, A[]>>;
  take(n: number): Promise<Result<E, A[]>>;
  first(): Promise<Result<E, A | undefined>>;
  count(): Promise<Result<E, number>>;
  
  // Iteration
  forEach(fn: (item: A) => void | Promise<void>): Promise<Result<E, void>>;
  
  // Transformations
  map<B>(fn: (item: A) => B): TypedAsyncIterable<E, B>;
  filter(fn: (item: A) => boolean): TypedAsyncIterable<E, A>;
  flatMap<F, B>(fn: (item: A) => TypedAsyncIterable<F, B>): TypedAsyncIterable<E | F, B>;
  mapAsync<B>(fn: (item: A) => Promise<B>): TypedAsyncIterable<E | Error, B>;
}

// Factory functions
export function fromStreamEffect<E, A>(streamEffect: Effect.Effect<Stream.Stream<A, E>>): TypedAsyncIterable<E, A>;
export function fromStream<E, A>(stream: Stream.Stream<A, E>): TypedAsyncIterable<E, A>;
export function fromArray<A>(items: A[]): TypedAsyncIterable<never, A>;
export function fromAsyncGenerator<E, A>(generator: () => AsyncGenerator<Result<E, A>>): TypedAsyncIterable<E, A>;
export function empty<E = never, A = never>(): TypedAsyncIterable<E, A>;
export function merge<E, A>(iterables: TypedAsyncIterable<E, A>[]): TypedAsyncIterable<E, A>;
export function concat<E, A>(iterables: TypedAsyncIterable<E, A>[]): TypedAsyncIterable<E, A>;
```

---

## Implementation Status

### ✅ Phase 1: Error System (COMPLETE)
- [x] Plain TypeScript error classes with `_tag` property
- [x] Error union types for each category
- [x] Type guards for error checking
- [x] Separate files: base.ts, query.ts, profile.ts, auth.ts, connection.ts, response.ts, feature.ts

### ✅ Phase 2: Result & Option Types (COMPLETE)
- [x] Result type with Ok/Err constructors
- [x] Option type with Some/None constructors
- [x] Utility functions (map, flatMap, match, etc.)
- [x] Comprehensive JSDoc documentation

### ✅ Phase 3: Stream Wrapper (COMPLETE)
- [x] TypedAsyncIterable interface
- [x] TypedAsyncIterableImpl class
- [x] collect, take, forEach, map, filter, flatMap, mapAsync methods
- [x] first, count methods
- [x] Factory functions for creating iterables

### ✅ Phase 4: Client Class (COMPLETE)
- [x] Instaloader class with all methods
- [x] Profile wrapper with all properties and methods
- [x] Post wrapper with all properties and methods
- [x] Story and Highlight wrappers
- [x] Hashtag wrapper
- [x] Session management methods

### ✅ Phase 5: Entry Points & Exports (COMPLETE)
- [x] src/index.ts - Client API exports (default)
- [x] src/effect/index.ts - Effect API exports
- [x] src/errors/index.ts - Error exports
- [x] Backward compatibility maintained

### ✅ Phase 6: Example Scripts (COMPLETE)
- [x] scripts/get-user-posts-promise.ts - Promise API example
- [x] scripts/get-user-posts.ts - Effect API example
- [x] scripts/login.ts - Login example
- [x] scripts/import-firefox-cookies.ts - Session import example

---

## Migration Guide

### For Existing Effect Users

The Effect API remains available at `instaloader-ts/effect`:

```typescript
// Before (if importing directly)
import { makeInstaloaderContext, profileFromUsername } from "instaloader-ts";

// After (use /effect subpath for Effect API)
import { makeInstaloaderContext, profileFromUsername } from "instaloader-ts/effect";
```

Note: Most Effect exports are also available from the main entry point for backward compatibility.

### For New Non-Effect Users

```typescript
import { Instaloader, isErr, isSome } from "instaloader-ts";

async function main() {
  // Create client
  const loaderResult = await Instaloader.create();
  if (isErr(loaderResult)) {
    console.error("Failed to create client");
    return;
  }
  const loader = loaderResult.value;
  
  // Get profile
  const profileResult = await loader.getProfile("instagram");
  if (isErr(profileResult)) {
    switch (profileResult.error._tag) {
      case "ProfileNotExistsError":
        console.error("Profile not found");
        break;
      case "ConnectionError":
        console.error("Connection failed");
        break;
      default:
        console.error("Error:", profileResult.error._tag);
    }
    return;
  }
  
  const profile = profileResult.value;
  console.log(`Followers: ${isSome(profile.followers) ? profile.followers.value : "N/A"}`);
  
  // Iterate posts with type-safe error handling
  for await (const postResult of profile.getPosts()) {
    if (isErr(postResult)) {
      console.error("Error fetching post:", postResult.error._tag);
      break;
    }
    console.log(postResult.value.shortcode);
  }
}
```

---

## File Structure

```
src/
├── client/                      # Promise-based client API
│   ├── index.ts                 # Public exports
│   ├── instaloader.ts           # Main client class (541 lines)
│   ├── result.ts                # Result<E, A> type (119 lines)
│   ├── option.ts                # Option<A> type (82 lines)
│   ├── async-iterable.ts        # TypedAsyncIterable (305 lines)
│   └── types.ts                 # Profile, Post, etc. interfaces (184 lines)
│
├── effect/                      # Effect API entry point
│   └── index.ts                 # Re-exports Effect-based API
│
├── errors/                      # Plain TypeScript error classes
│   ├── index.ts                 # All exports + union types
│   ├── base.ts                  # InstaloaderBaseError
│   ├── query.ts                 # Query errors
│   ├── profile.ts               # Profile errors
│   ├── auth.ts                  # Auth errors
│   ├── connection.ts            # Connection errors
│   ├── response.ts              # Response errors
│   └── feature.ts               # Feature errors
│
├── core/                        # Effect-based implementations
│   ├── context.ts               # InstaloaderContext
│   └── instaloader.ts           # Core operations
│
├── structures/                  # Data structures (Effect-based)
│   ├── index.ts                 # All structure exports
│   ├── profile.ts               # Profile operations
│   ├── post.ts                  # Post operations
│   ├── story.ts                 # Story operations
│   ├── highlight.ts             # Highlight operations
│   ├── hashtag.ts               # Hashtag operations
│   └── common.ts                # Shared types
│
├── iterators/                   # Stream iterators
│   ├── index.ts                 # Iterator exports
│   ├── node-iterator.ts         # Node-based iteration
│   └── section-iterator.ts      # Section-based iteration
│
├── exceptions/                  # Effect Data.TaggedError classes
│   └── index.ts                 # Internal Effect exceptions
│
├── utils/                       # Utility functions
│   └── try-catch.ts             # Try-catch helpers
│
└── index.ts                     # Main entry: client API + backward compat
```

---

## Summary

This design achieves all goals:

1. ✅ **Zero Effect dependency for non-Effect users** - Client API uses plain Promises and TypeScript types
2. ✅ **Full type safety** - `Result<ProfileNotExistsError | ConnectionError, Profile>` preserves all error information
3. ✅ **Both APIs available** - `instaloader-ts` for client API, `instaloader-ts/effect` for Effect API
4. ✅ **Familiar patterns** - Standard async/await with pattern matching on `_tag`
5. ✅ **No breaking changes** - Existing Effect API remains unchanged
6. ✅ **Excellent DX** - Client class provides good autocomplete and documentation

The implementation is complete and both APIs are fully functional.
