import type { Option } from "./option";
import type { Result } from "./result";
import type { TypedAsyncIterable } from "./async-iterable";
import type {
  ConnectionError,
  BadResponseError,
  AbortDownloadError,
  LoginRequiredError,
} from "../errors";

export type PostError = ConnectionError | BadResponseError | AbortDownloadError;

export interface InstaloaderOptions {
  sleep?: boolean;
  quiet?: boolean;
  userAgent?: string;
  maxConnectionAttempts?: number;
  requestTimeout?: number;
  iphoneSupport?: boolean;
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

  getPosts(): TypedAsyncIterable<PostError, Post>;
  getTaggedPosts(): TypedAsyncIterable<PostError, Post>;
  getReels(): TypedAsyncIterable<PostError, Post>;
  getIgtvPosts(): TypedAsyncIterable<PostError, Post>;
  getSavedPosts(): Promise<Result<LoginRequiredError, TypedAsyncIterable<PostError, Post>>>;
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
}

export interface SidecarNode {
  readonly displayUrl: string;
  readonly isVideo: boolean;
  readonly videoUrl: Option<string>;
}

export interface Story {
  readonly id: string;
  readonly typename: string;
  readonly url: string;
  readonly isVideo: boolean;
  readonly videoUrl: Option<string>;
  readonly dateUtc: Option<Date>;
  readonly ownerUsername: string;
  readonly ownerId: number;
}

export interface Highlight {
  readonly id: string;
  readonly title: string;
  readonly coverUrl: string;
  readonly ownerUsername: string;
  readonly ownerId: number;
  getItems(): TypedAsyncIterable<PostError, Story>;
}

export interface Hashtag {
  readonly name: string;
  readonly mediacount: Option<number>;
  readonly profilePicUrl: Option<string>;
  getPosts(): TypedAsyncIterable<PostError, Post>;
  getTopPosts(): TypedAsyncIterable<PostError, Post>;
  getRecentPosts(): TypedAsyncIterable<PostError, Post>;
}
