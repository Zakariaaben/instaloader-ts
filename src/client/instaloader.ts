import { Effect, Option as EffectOption, Stream } from "effect";
import type { Result } from "./result";
import { Ok, Err } from "./result";
import type { Option } from "./option";
import { Some, None } from "./option";
import type { TypedAsyncIterable } from "./async-iterable";
import { fromStream, fromStreamEffect, fromAsyncGenerator } from "./async-iterable";
import type {
  InstaloaderOptions,
  Profile,
  Post,
  PostError,
  SessionData,
  StoryItem,
  Story,
  Highlight,
  Hashtag,
  PostLocation,
  SidecarNode,
  ProfileFetchError,
} from "./types";
import type {
  ProfileError,
  ConnectionError as ConnectionErr,
  LoginRequiredError,
  ProfileNotExistsError,
} from "../errors";
import type { ContextError } from "../core/context";
import {
  makeInstaloaderContext,
  type InstaloaderContextShape,
} from "../core/context";
import * as ProfileEffect from "../structures/profile";
import * as PostEffect from "../structures/post";
import * as StoryEffect from "../structures/story";
import * as HighlightEffect from "../structures/highlight";
import * as HashtagEffect from "../structures/hashtag";
import {
  getStoriesEffect,
  getHighlightsEffect,
  getFeedPostsEffect,
} from "../core/instaloader";
import type { JsonNode } from "../structures/common";

type CreateProfileError = ProfileNotExistsError | ConnectionErr | ProfileError;

function convertEffectOption<A>(effectOption: EffectOption.Option<A>): Option<A> {
  return EffectOption.isSome(effectOption) ? Some(effectOption.value) : None;
}

function createStoryItemWrapper(item: StoryEffect.StoryItemData): StoryItem {
  return {
    mediaid: StoryEffect.storyItemMediaid(item),
    shortcode: StoryEffect.storyItemShortcode(item),
    typename: StoryEffect.storyItemTypename(item),
    url: StoryEffect.storyItemUrl(item),
    isVideo: StoryEffect.storyItemIsVideo(item),
    videoUrl: StoryEffect.storyItemVideoUrl(item),
    dateUtc: StoryEffect.storyItemDateUtc(item),
    dateLocal: StoryEffect.storyItemDateLocal(item),
    expiringUtc: StoryEffect.storyItemExpiringUtc(item),
    caption: StoryEffect.storyItemCaption(item),
    captionHashtags: StoryEffect.storyItemCaptionHashtags(item),
    captionMentions: StoryEffect.storyItemCaptionMentions(item),
    ownerUsername: convertEffectOption(StoryEffect.storyItemOwnerUsername(item)),
    ownerId: convertEffectOption(StoryEffect.storyItemOwnerId(item)),
  };
}

function createStoryWrapper(
  context: InstaloaderContextShape,
  storyData: StoryEffect.StoryData
): Story {
  return {
    ownerUsername: StoryEffect.storyOwnerUsername(storyData),
    ownerId: StoryEffect.storyOwnerId(storyData),
    lastSeenUtc: StoryEffect.storyLastSeenUtc(storyData),
    latestMediaUtc: StoryEffect.storyLatestMediaUtc(storyData),
    itemcount: StoryEffect.storyItemcount(storyData),
    async getItems(): Promise<Result<PostError, StoryItem[]>> {
      const result = await Effect.runPromise(
        Effect.either(StoryEffect.storyGetItems(context, storyData))
      );
      if (result._tag === "Left") {
        return Err(result.left as PostError);
      }
      return Ok(result.right.map(createStoryItemWrapper));
    },
  };
}

function createHighlightWrapper(
  context: InstaloaderContextShape,
  highlightData: HighlightEffect.HighlightData
): Highlight {
  return {
    uniqueId: HighlightEffect.highlightUniqueId(highlightData),
    title: HighlightEffect.highlightTitle(highlightData),
    coverUrl: HighlightEffect.highlightCoverUrl(highlightData),
    coverCroppedUrl: HighlightEffect.highlightCoverCroppedUrl(highlightData),
    ownerUsername: HighlightEffect.highlightOwnerUsername(highlightData),
    ownerId: HighlightEffect.highlightOwnerId(highlightData),
    async getItems(): Promise<Result<PostError, StoryItem[]>> {
      const result = await Effect.runPromise(
        Effect.either(HighlightEffect.highlightGetItems(context, highlightData))
      );
      if (result._tag === "Left") {
        return Err(result.left as PostError);
      }
      return Ok(result.right.map(createStoryItemWrapper));
    },
  };
}

function createPostWrapper(
  context: InstaloaderContextShape,
  postData: PostEffect.PostData
): Post {
  return {
    shortcode: PostEffect.shortcode(postData),
    mediaid: PostEffect.mediaid(postData),
    typename: PostEffect.typename(postData),
    url: PostEffect.url(postData),
    caption: PostEffect.caption(postData),
    likes: convertEffectOption(PostEffect.likes(postData)),
    comments: convertEffectOption(PostEffect.comments(postData)),
    isVideo: PostEffect.isVideo(postData),
    dateUtc: convertEffectOption(PostEffect.dateUtc(postData)),
    dateLocal: convertEffectOption(PostEffect.dateLocal(postData)),
    title: PostEffect.title(postData),
    accessibilityCaption: PostEffect.accessibilityCaption(postData),
    captionHashtags: PostEffect.captionHashtags(postData),
    captionMentions: PostEffect.captionMentions(postData),
    taggedUsers: PostEffect.taggedUsers(postData),
    videoUrl: convertEffectOption(PostEffect.videoUrl(postData)),
    videoViewCount: convertEffectOption(PostEffect.videoViewCount(postData)),
    videoDuration: convertEffectOption(PostEffect.videoDuration(postData)),
    mediacount: PostEffect.mediacount(postData),
    isSponsored: PostEffect.isSponsored(postData),
    isPinned: PostEffect.isPinned(postData),
    ownerUsername: convertEffectOption(PostEffect.ownerUsername(postData)),
    ownerId: convertEffectOption(PostEffect.ownerId(postData)),

    async getSidecarNodes(start = 0, end = -1): Promise<Result<PostError, SidecarNode[]>> {
      const result = await Effect.runPromise(
        Effect.either(PostEffect.getSidecarNodes(context, postData, start, end))
      );
      if (result._tag === "Left") {
        return Err(result.left as PostError);
      }
      return Ok(result.right.map((node) => ({
        displayUrl: node.displayUrl,
        isVideo: node.isVideo,
        videoUrl: node.videoUrl,
      })));
    },

    async getVideoUrl(): Promise<Result<PostError, string | null>> {
      const result = await Effect.runPromise(
        Effect.either(PostEffect.getVideoUrl(context, postData))
      );
      if (result._tag === "Left") {
        return Err(result.left as PostError);
      }
      return Ok(result.right);
    },

    async getLocation(): Promise<Result<PostError | LoginRequiredError, PostLocation | null>> {
      const result = await Effect.runPromise(
        Effect.either(PostEffect.getLocation(context, postData))
      );
      if (result._tag === "Left") {
        return Err(result.left as PostError | LoginRequiredError);
      }
      return Ok(result.right);
    },

    async getOwnerProfile(): Promise<Result<PostError, Profile>> {
      const result = await Effect.runPromise(
        Effect.either(PostEffect.getOwnerProfile(context, postData))
      );
      if (result._tag === "Left") {
        return Err(result.left as PostError);
      }
      return Ok(createProfileWrapper(context, result.right));
    },
  };
}

function createProfileWrapper(
  context: InstaloaderContextShape,
  profileData: ProfileEffect.ProfileData
): Profile {
  return {
    userid: ProfileEffect.userid(profileData),
    username: ProfileEffect.username(profileData),
    fullName: convertEffectOption(ProfileEffect.fullName(profileData)),
    biography: convertEffectOption(ProfileEffect.biography(profileData)),
    followers: convertEffectOption(ProfileEffect.followers(profileData)),
    followees: convertEffectOption(ProfileEffect.followees(profileData)),
    mediacount: convertEffectOption(ProfileEffect.mediacount(profileData)),
    isPrivate: convertEffectOption(ProfileEffect.isPrivate(profileData)),
    isVerified: convertEffectOption(ProfileEffect.isVerified(profileData)),
    profilePicUrl: convertEffectOption(ProfileEffect.profilePicUrl(profileData)),
    externalUrl: convertEffectOption(ProfileEffect.externalUrl(profileData)),
    isBusinessAccount: convertEffectOption(ProfileEffect.isBusinessAccount(profileData)),
    businessCategoryName: convertEffectOption(ProfileEffect.businessCategoryName(profileData)),
    biographyHashtags: ProfileEffect.biographyHashtags(profileData),
    biographyMentions: ProfileEffect.biographyMentions(profileData),
    followedByViewer: convertEffectOption(ProfileEffect.followedByViewer(profileData)),
    followsViewer: convertEffectOption(ProfileEffect.followsViewer(profileData)),
    blockedByViewer: convertEffectOption(ProfileEffect.blockedByViewer(profileData)),
    hasBlockedViewer: convertEffectOption(ProfileEffect.hasBlockedViewer(profileData)),
    requestedByViewer: convertEffectOption(ProfileEffect.requestedByViewer(profileData)),
    hasRequestedViewer: convertEffectOption(ProfileEffect.hasRequestedViewer(profileData)),

    getPosts(): TypedAsyncIterable<PostError, Post> {
      const streamEffect = ProfileEffect.getPostsStream(
        context,
        profileData,
        (node: JsonNode, prof: ProfileEffect.ProfileData) => createPostWrapper(context, PostEffect.fromNodeSync(node, prof))
      );
      return fromStreamEffect(streamEffect) as TypedAsyncIterable<PostError, Post>;
    },

    getTaggedPosts(): TypedAsyncIterable<PostError, Post> {
      const stream = ProfileEffect.getTaggedPostsStream(
        context,
        profileData,
        (node: JsonNode, ownerProf: ProfileEffect.ProfileData | null) => 
          createPostWrapper(context, PostEffect.fromNodeSync(node, ownerProf ?? undefined))
      );
      return fromStream(stream) as TypedAsyncIterable<PostError, Post>;
    },

    getReels(): TypedAsyncIterable<PostError, Post> {
      const stream = ProfileEffect.getReelsStream(
        context,
        profileData,
        (node: JsonNode) => createPostWrapper(context, PostEffect.fromNodeSync(node))
      );
      return fromStream(stream) as TypedAsyncIterable<PostError, Post>;
    },

    getIgtvPosts(): TypedAsyncIterable<PostError, Post> {
      const stream = ProfileEffect.getIgtvPostsStream(
        context,
        profileData,
        (node: JsonNode, prof: ProfileEffect.ProfileData) => createPostWrapper(context, PostEffect.fromNodeSync(node, prof))
      );
      return fromStream(stream) as TypedAsyncIterable<PostError, Post>;
    },

    async getSavedPosts(): Promise<Result<LoginRequiredError, TypedAsyncIterable<PostError, Post>>> {
      const result = await Effect.runPromise(
        Effect.either(
          ProfileEffect.getSavedPostsStream(
            context,
            profileData,
            (node: JsonNode) => createPostWrapper(context, PostEffect.fromNodeSync(node))
          )
        )
      );

      if (result._tag === "Left") {
        return Err(result.left as LoginRequiredError);
      }

      return Ok(fromStream(result.right) as TypedAsyncIterable<PostError, Post>);
    },

    async getProfilePicUrl(): Promise<Result<ProfileFetchError, string>> {
      const result = await Effect.runPromise(
        Effect.either(ProfileEffect.getProfilePicUrl(context, profileData))
      );
      if (result._tag === "Left") {
        return Err(result.left as ProfileFetchError);
      }
      return Ok(result.right);
    },

    async getHasPublicStory(): Promise<Result<ProfileFetchError, boolean>> {
      const result = await Effect.runPromise(
        Effect.either(ProfileEffect.getHasPublicStory(context, profileData))
      );
      if (result._tag === "Left") {
        return Err(result.left as ProfileFetchError);
      }
      return Ok(result.right);
    },
  };
}

function createHashtagWrapper(
  context: InstaloaderContextShape,
  hashtagData: HashtagEffect.HashtagData
): Hashtag {
  return {
    name: HashtagEffect.hashtagName(hashtagData),

    async getMediacount(): Promise<Result<PostError, number>> {
      const result = await Effect.runPromise(
        Effect.either(HashtagEffect.hashtagGetMediacount(context, hashtagData))
      );
      if (result._tag === "Left") {
        return Err(result.left as PostError);
      }
      return Ok(result.right);
    },

    async getProfilePicUrl(): Promise<Result<PostError, string>> {
      const result = await Effect.runPromise(
        Effect.either(HashtagEffect.hashtagGetProfilePicUrl(context, hashtagData))
      );
      if (result._tag === "Left") {
        return Err(result.left as PostError);
      }
      return Ok(result.right);
    },

    getPosts(): TypedAsyncIterable<PostError, Post> {
      async function* generator(): AsyncGenerator<Result<PostError, Post>, void, undefined> {
        const streamResult = await Effect.runPromise(
          Effect.either(HashtagEffect.hashtagGetPostsStream(context, hashtagData))
        );
        if (streamResult._tag === "Left") {
          yield Err(streamResult.left as PostError);
          return;
        }
        const collectResult = await Effect.runPromise(
          Effect.either(Stream.runCollect(streamResult.right))
        );
        if (collectResult._tag === "Left") {
          yield Err(collectResult.left as PostError);
          return;
        }
        for (const postData of collectResult.right) {
          yield Ok(createPostWrapper(context, postData));
        }
      }
      return fromAsyncGenerator(generator);
    },

    getTopPosts(): TypedAsyncIterable<PostError, Post> {
      async function* generator(): AsyncGenerator<Result<PostError, Post>, void, undefined> {
        const streamResult = await Effect.runPromise(
          Effect.either(HashtagEffect.hashtagGetTopPostsStream(context, hashtagData))
        );
        if (streamResult._tag === "Left") {
          yield Err(streamResult.left as PostError);
          return;
        }
        const collectResult = await Effect.runPromise(
          Effect.either(Stream.runCollect(streamResult.right))
        );
        if (collectResult._tag === "Left") {
          yield Err(collectResult.left as PostError);
          return;
        }
        for (const postData of collectResult.right) {
          yield Ok(createPostWrapper(context, postData));
        }
      }
      return fromAsyncGenerator(generator);
    },
  };
}

export class Instaloader {
  private readonly ctx: InstaloaderContextShape;

  private constructor(ctx: InstaloaderContextShape) {
    this.ctx = ctx;
  }

  static async create(options?: InstaloaderOptions): Promise<Result<never, Instaloader>> {
    const ctx = await Effect.runPromise(makeInstaloaderContext(options));
    return Ok(new Instaloader(ctx));
  }

  async isLoggedIn(): Promise<boolean> {
    return Effect.runPromise(this.ctx.isLoggedIn);
  }

  async getUsername(): Promise<string | null> {
    return Effect.runPromise(this.ctx.getUsername);
  }

  async login(username: string, password: string): Promise<Result<ContextError, void>> {
    return this.runEffect(this.ctx.login(username, password));
  }

  async twoFactorLogin(code: string): Promise<Result<ContextError, void>> {
    return this.runEffect(this.ctx.twoFactorLogin(code));
  }

  async testLogin(): Promise<Result<ContextError, string | null>> {
    return this.runEffect(this.ctx.testLogin);
  }

  async getProfile(username: string): Promise<Result<CreateProfileError, Profile>> {
    const result = await Effect.runPromise(
      Effect.either(ProfileEffect.fromUsername(this.ctx, username))
    );

    if (result._tag === "Left") {
      return Err(result.left as CreateProfileError);
    }

    return Ok(createProfileWrapper(this.ctx, result.right));
  }

  async getProfileById(profileId: number): Promise<Result<CreateProfileError, Profile>> {
    const result = await Effect.runPromise(
      Effect.either(ProfileEffect.fromId(this.ctx, profileId))
    );

    if (result._tag === "Left") {
      return Err(result.left as CreateProfileError);
    }

    return Ok(createProfileWrapper(this.ctx, result.right));
  }

  async getPost(shortcode: string): Promise<Result<PostError, Post>> {
    const result = await Effect.runPromise(
      Effect.either(PostEffect.fromShortcodeEffect(this.ctx, shortcode))
    );

    if (result._tag === "Left") {
      return Err(result.left as PostError);
    }

    return Ok(createPostWrapper(this.ctx, result.right));
  }

  async getPostByMediaId(mediaid: number): Promise<Result<PostError, Post>> {
    const result = await Effect.runPromise(
      Effect.either(PostEffect.fromMediaidEffect(this.ctx, mediaid))
    );

    if (result._tag === "Left") {
      return Err(result.left as PostError);
    }

    return Ok(createPostWrapper(this.ctx, result.right));
  }

  async getOwnProfile(): Promise<Result<CreateProfileError | LoginRequiredError, Profile>> {
    const result = await Effect.runPromise(
      Effect.either(ProfileEffect.ownProfile(this.ctx))
    );

    if (result._tag === "Left") {
      return Err(result.left as CreateProfileError | LoginRequiredError);
    }

    return Ok(createProfileWrapper(this.ctx, result.right));
  }

  async getStories(userids?: number[]): Promise<Result<LoginRequiredError | PostError, Story[]>> {
    const result = await Effect.runPromise(
      Effect.either(getStoriesEffect(this.ctx, userids))
    );

    if (result._tag === "Left") {
      return Err(result.left as LoginRequiredError | PostError);
    }

    return Ok(result.right.map((storyData) => createStoryWrapper(this.ctx, storyData)));
  }

  async getHighlights(
    user: number | Profile
  ): Promise<Result<LoginRequiredError | PostError, Highlight[]>> {
    const userId = typeof user === "number" ? user : user.userid;
    const result = await Effect.runPromise(
      Effect.either(getHighlightsEffect(this.ctx, userId))
    );

    if (result._tag === "Left") {
      return Err(result.left as LoginRequiredError | PostError);
    }

    return Ok(result.right.map((highlightData) => createHighlightWrapper(this.ctx, highlightData)));
  }

  getFeedPosts(): Promise<Result<LoginRequiredError, TypedAsyncIterable<PostError, Post>>> {
    return Effect.runPromise(
      Effect.either(getFeedPostsEffect(this.ctx))
    ).then((result) => {
      if (result._tag === "Left") {
        return Err(result.left as LoginRequiredError);
      }
      const mappedStream = Stream.map(result.right, (postData) =>
        createPostWrapper(this.ctx, postData)
      );
      return Ok(fromStream(mappedStream) as TypedAsyncIterable<PostError, Post>);
    });
  }

  async getHashtag(name: string): Promise<Result<PostError, Hashtag>> {
    const result = await Effect.runPromise(
      Effect.either(HashtagEffect.fromNameEffect(this.ctx, name))
    );

    if (result._tag === "Left") {
      return Err(result.left as PostError);
    }

    return Ok(createHashtagWrapper(this.ctx, result.right));
  }

  get context(): InstaloaderContextShape {
    return this.ctx;
  }

  async loadSessionData(username: string, sessionData: SessionData): Promise<Result<never, void>> {
    await Effect.runPromise(this.ctx.loadSession(username, sessionData));
    return Ok(undefined);
  }

  async getSessionData(): Promise<Result<LoginRequiredError, SessionData>> {
    const isLoggedIn = await Effect.runPromise(this.ctx.isLoggedIn);
    if (!isLoggedIn) {
      const { LoginRequiredError } = await import("../errors");
      return Err(new LoginRequiredError("Login required to get session data"));
    }
    const sessionData = await Effect.runPromise(this.ctx.saveSession);
    return Ok(sessionData);
  }

  private async runEffect<E, A>(effect: Effect.Effect<A, E>): Promise<Result<E, A>> {
    const result = await Effect.runPromise(Effect.either(effect));
    if (result._tag === "Left") {
      return Err(result.left);
    }
    return Ok(result.right);
  }
}
