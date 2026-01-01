import type { Option } from "./option";
import type { Result } from "./result";
import type { TypedAsyncIterable } from "./async-iterable";
import type {
  ConnectionError,
  BadResponseError,
  AbortDownloadError,
  LoginRequiredError,
  ProfileError as ProfileErr,
} from "../errors";

export type PostError = ConnectionError | BadResponseError | AbortDownloadError;
export type ProfileFetchError = ProfileErr | ConnectionError | BadResponseError | AbortDownloadError;

export interface SessionData {
  [key: string]: string;
}

export interface InstaloaderOptions {
  sleep?: boolean;
  quiet?: boolean;
  userAgent?: string;
  maxConnectionAttempts?: number;
  requestTimeout?: number;
  iphoneSupport?: boolean;
}

/**
 * Location data for a post
 */
export interface PostLocation {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
  readonly hasPublicPage: boolean | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

/**
 * A node in a sidecar/carousel post
 */
export interface SidecarNode {
  readonly displayUrl: string;
  readonly isVideo: boolean;
  readonly videoUrl: string | null;
}

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

  /** Get profile posts iterator */
  getPosts(): TypedAsyncIterable<PostError, Post>;
  /** Get posts where user is tagged */
  getTaggedPosts(): TypedAsyncIterable<PostError, Post>;
  /** Get reels iterator */
  getReels(): TypedAsyncIterable<PostError, Post>;
  /** Get IGTV posts iterator */
  getIgtvPosts(): TypedAsyncIterable<PostError, Post>;
  /** Get saved posts (requires login as this user) */
  getSavedPosts(): Promise<Result<LoginRequiredError, TypedAsyncIterable<PostError, Post>>>;
  /** Get HD profile picture URL (may require login) */
  getProfilePicUrl(): Promise<Result<ProfileFetchError, string>>;
  /** Check if profile has a public story */
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

  /** Get sidecar/carousel nodes (for GraphSidecar posts) */
  getSidecarNodes(start?: number, end?: number): Promise<Result<PostError, SidecarNode[]>>;
  /** Get best quality video URL (for video posts) */
  getVideoUrl(): Promise<Result<PostError, string | null>>;
  /** Get post location (requires login) */
  getLocation(): Promise<Result<PostError | LoginRequiredError, PostLocation | null>>;
  /** Get post owner's profile */
  getOwnerProfile(): Promise<Result<PostError, Profile>>;
  /** Get sponsored brand/business profiles */
  getSponsorUsers(): Promise<Profile[]>;
  /** Get coauthor/collaborator profiles */
  getCoauthorProducers(): Promise<Profile[]>;
}

/**
 * A single story item
 */
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

/**
 * A user's story (collection of story items)
 */
export interface Story {
  readonly ownerUsername: string;
  readonly ownerId: number;
  readonly lastSeenUtc: Date | null;
  readonly latestMediaUtc: Date;
  readonly itemcount: number;
  /** Get all story items */
  getItems(): Promise<Result<PostError, StoryItem[]>>;
}

/**
 * A highlight reel
 */
export interface Highlight {
  readonly uniqueId: number;
  readonly title: string;
  readonly coverUrl: string;
  readonly coverCroppedUrl: string;
  readonly ownerUsername: string;
  readonly ownerId: number;
  /** Get highlight items */
  getItems(): Promise<Result<PostError, StoryItem[]>>;
}

/**
 * A hashtag
 */
export interface Hashtag {
  readonly name: string;
  /** Get mediacount (may fetch from API) */
  getMediacount(): Promise<Result<PostError, number>>;
  /** Get profile pic URL (may fetch from API) */
  getProfilePicUrl(): Promise<Result<PostError, string>>;
  /** Get all posts with this hashtag */
  getPosts(): TypedAsyncIterable<PostError, Post>;
  /** Get top posts with this hashtag */
  getTopPosts(): TypedAsyncIterable<PostError, Post>;
}
