import { Effect, Option as EffectOption } from "effect";
import type { Result } from "./result";
import { Ok, Err } from "./result";
import type { Option } from "./option";
import { Some, None } from "./option";
import type { TypedAsyncIterable } from "./async-iterable";
import { fromStream, fromStreamEffect } from "./async-iterable";
import type {
  InstaloaderOptions,
  Profile,
  Post,
  PostError,
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
import {
  loadSessionFromFileEffect,
  saveSessionToFileEffect,
  getDefaultSessionFilename,
  PlatformLayer,
} from "../core/instaloader";
import * as ProfileEffect from "../structures/profile";
import * as PostEffect from "../structures/post";
import type { JsonNode } from "../structures/common";

type CreateProfileError = ProfileNotExistsError | ConnectionErr | ProfileError;

function convertEffectOption<A>(effectOption: EffectOption.Option<A>): Option<A> {
  return EffectOption.isSome(effectOption) ? Some(effectOption.value) : None;
}

function createPostWrapper(postData: PostEffect.PostData): Post {
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
  };
}

function createProfileWrapper(
  context: InstaloaderContextShape,
  profileData: ProfileEffect.ProfileData
): Profile {
  const profile: Profile = {
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
        (node: JsonNode, prof: ProfileEffect.ProfileData) => createPostWrapper(PostEffect.fromNodeSync(node, prof))
      );
      return fromStreamEffect(streamEffect) as TypedAsyncIterable<PostError, Post>;
    },

    getTaggedPosts(): TypedAsyncIterable<PostError, Post> {
      const stream = ProfileEffect.getTaggedPostsStream(
        context,
        profileData,
        (node: JsonNode, ownerProf: ProfileEffect.ProfileData | null) => 
          createPostWrapper(PostEffect.fromNodeSync(node, ownerProf ?? undefined))
      );
      return fromStream(stream) as TypedAsyncIterable<PostError, Post>;
    },

    getReels(): TypedAsyncIterable<PostError, Post> {
      const stream = ProfileEffect.getReelsStream(
        context,
        profileData,
        (node: JsonNode) => createPostWrapper(PostEffect.fromNodeSync(node))
      );
      return fromStream(stream) as TypedAsyncIterable<PostError, Post>;
    },

    getIgtvPosts(): TypedAsyncIterable<PostError, Post> {
      const stream = ProfileEffect.getIgtvPostsStream(
        context,
        profileData,
        (node: JsonNode, prof: ProfileEffect.ProfileData) => createPostWrapper(PostEffect.fromNodeSync(node, prof))
      );
      return fromStream(stream) as TypedAsyncIterable<PostError, Post>;
    },

    async getSavedPosts(): Promise<Result<LoginRequiredError, TypedAsyncIterable<PostError, Post>>> {
      const result = await Effect.runPromise(
        Effect.either(
          ProfileEffect.getSavedPostsStream(
            context,
            profileData,
            (node: JsonNode) => createPostWrapper(PostEffect.fromNodeSync(node))
          )
        )
      );

      if (result._tag === "Left") {
        return Err(result.left as LoginRequiredError);
      }

      return Ok(fromStream(result.right) as TypedAsyncIterable<PostError, Post>);
    },
  };

  return profile;
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

    return Ok(createPostWrapper(result.right));
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

  get context(): InstaloaderContextShape {
    return this.ctx;
  }

  async loadSession(username: string, filename?: string): Promise<Result<Error, void>> {
    const effect = loadSessionFromFileEffect(this.ctx, username, filename);
    const result = await Effect.runPromise(
      Effect.either(Effect.provide(effect, PlatformLayer))
    );
    if (result._tag === "Left") {
      return Err(result.left as Error);
    }
    return Ok(result.right);
  }

  async saveSession(filename?: string): Promise<Result<LoginRequiredError | Error, void>> {
    const effect = saveSessionToFileEffect(this.ctx, filename);
    const result = await Effect.runPromise(
      Effect.either(Effect.provide(effect, PlatformLayer))
    );
    if (result._tag === "Left") {
      return Err(result.left as LoginRequiredError | Error);
    }
    return Ok(result.right);
  }

  getDefaultSessionFilename(username: string): string {
    return getDefaultSessionFilename(username);
  }

  private async runEffect<E, A>(effect: Effect.Effect<A, E>): Promise<Result<E, A>> {
    const result = await Effect.runPromise(Effect.either(effect));
    if (result._tag === "Left") {
      return Err(result.left);
    }
    return Ok(result.right);
  }
}
