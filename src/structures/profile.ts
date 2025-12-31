import { Effect, Option, Stream, Ref } from "effect";
import type { InstaloaderContextShape } from "../core/context.ts";
import {
  AbortDownloadError,
  IPhoneSupportDisabledError,
  LoginRequiredError,
  ProfileNotExistsError,
  QueryReturnedNotFoundError,
  type InstaloaderErrors,
} from "../exceptions/index.ts";
import {
  HASHTAG_REGEX,
  MENTION_REGEX,
  type JsonNode,
} from "./common.ts";
import { createNodeStream, type NodeIteratorConfig, type NodeIteratorError } from "../iterators/node-iterator.ts";

export type ProfileError = InstaloaderErrors | AbortDownloadError;

export interface ProfileData {
  readonly node: JsonNode;
  readonly iphoneStruct: JsonNode | null;
}

const getMetadata = <T>(node: JsonNode, ...keys: string[]): Option.Option<T> => {
  try {
    let d: unknown = node;
    for (const key of keys) {
      if (d === null || d === undefined || typeof d !== "object") {
        return Option.none();
      }
      d = (d as JsonNode)[key];
    }
    if (d === undefined) return Option.none();
    return Option.some(d as T);
  } catch {
    return Option.none();
  }
};

export const fromUsername = (
  context: InstaloaderContextShape,
  username: string
): Effect.Effect<ProfileData, ProfileError> =>
  Effect.gen(function* () {
    const result = yield* Effect.either(
      context.getIphoneJson(`api/v1/users/web_profile_info/?username=${username.toLowerCase()}`, {})
    );

    if (result._tag === "Left") {
      const err = result.left;
      if (err instanceof QueryReturnedNotFoundError) {
        return yield* Effect.fail(
          new ProfileNotExistsError({ message: `Profile ${username} does not exist.` })
        );
      }
      return yield* Effect.fail(err);
    }

    const metadata = result.right;
    const dataNode = metadata["data"] as JsonNode | undefined;
    const userData = dataNode?.["user"] as JsonNode | null;
    if (userData === null || userData === undefined) {
      return yield* Effect.fail(
        new ProfileNotExistsError({ message: `Profile ${username} does not exist.` })
      );
    }

    const iphoneStruct = userData["iphone_struct"] as JsonNode | null ?? null;
    return { node: userData, iphoneStruct };
  });

export const fromId = (
  context: InstaloaderContextShape,
  profileId: number
): Effect.Effect<ProfileData, ProfileError> =>
  Effect.gen(function* () {
    const data = yield* context.graphqlQuery("7c16654f22c819fb63d1183034a5162f", {
      user_id: String(profileId),
      include_chaining: false,
      include_reel: true,
      include_suggested_users: false,
      include_logged_out_extras: false,
      include_highlight_reels: false,
    });

    const userData = (data["data"] as JsonNode)?.["user"] as JsonNode | null;
    if (userData) {
      const reel = userData["reel"] as JsonNode;
      const owner = reel["owner"] as JsonNode;
      const iphoneStruct = owner["iphone_struct"] as JsonNode | null ?? null;
      return { node: owner, iphoneStruct };
    }

    return yield* Effect.fail(
      new ProfileNotExistsError({
        message: `No profile found, the user may have blocked you (ID: ${profileId}).`,
      })
    );
  });

export const fromIphoneStruct = (media: JsonNode): ProfileData => ({
  node: {
    id: media["pk"],
    username: media["username"],
    is_private: media["is_private"],
    full_name: media["full_name"],
    profile_pic_url_hd: media["profile_pic_url"],
  },
  iphoneStruct: media,
});

export const ownProfile = (
  context: InstaloaderContextShape
): Effect.Effect<ProfileData, ProfileError | LoginRequiredError> =>
  Effect.gen(function* () {
    const isLoggedIn = yield* context.isLoggedIn;
    if (!isLoggedIn) {
      return yield* Effect.fail(
        new LoginRequiredError({ message: "Login required to access own profile." })
      );
    }
    const data = yield* context.graphqlQuery("d6f4427fbe92d846298cf93df0b937d3", {});
    const userData = (data["data"] as JsonNode)["user"] as JsonNode;
    const iphoneStruct = userData["iphone_struct"] as JsonNode | null ?? null;
    return { node: userData, iphoneStruct };
  });

export const userid = (profile: ProfileData): number =>
  Number(Option.getOrThrow(getMetadata<string | number>(profile.node, "id")));

export const username = (profile: ProfileData): string =>
  Option.getOrThrow(getMetadata<string>(profile.node, "username")).toLowerCase();

export const isPrivate = (profile: ProfileData): Option.Option<boolean> =>
  getMetadata<boolean>(profile.node, "is_private");

export const followedByViewer = (profile: ProfileData): Option.Option<boolean> =>
  getMetadata<boolean>(profile.node, "followed_by_viewer");

export const mediacount = (profile: ProfileData): Option.Option<number> =>
  getMetadata<number>(profile.node, "edge_owner_to_timeline_media", "count");

export const igtvcount = (profile: ProfileData): Option.Option<number> =>
  getMetadata<number>(profile.node, "edge_felix_video_timeline", "count");

export const followers = (profile: ProfileData): Option.Option<number> =>
  getMetadata<number>(profile.node, "edge_followed_by", "count");

export const followees = (profile: ProfileData): Option.Option<number> =>
  getMetadata<number>(profile.node, "edge_follow", "count");

export const externalUrl = (profile: ProfileData): Option.Option<string | null> =>
  getMetadata<string | null>(profile.node, "external_url");

export const isBusinessAccount = (profile: ProfileData): Option.Option<boolean> =>
  getMetadata<boolean>(profile.node, "is_business_account");

export const businessCategoryName = (profile: ProfileData): Option.Option<string> =>
  getMetadata<string>(profile.node, "business_category_name");

export const biography = (profile: ProfileData): Option.Option<string> =>
  Option.map(
    getMetadata<string>(profile.node, "biography"),
    (bio) => bio.normalize("NFC")
  );

export const biographyHashtags = (profile: ProfileData): string[] => {
  const bio = biography(profile);
  if (Option.isNone(bio) || !bio.value) return [];
  const matches = bio.value.toLowerCase().matchAll(HASHTAG_REGEX);
  return Array.from(matches, (m) => m[1]).filter((s): s is string => s !== undefined);
};

export const biographyMentions = (profile: ProfileData): string[] => {
  const bio = biography(profile);
  if (Option.isNone(bio) || !bio.value) return [];
  const matches = bio.value.toLowerCase().matchAll(MENTION_REGEX);
  return Array.from(matches, (m) => m[1]).filter((s): s is string => s !== undefined);
};

export const blockedByViewer = (profile: ProfileData): Option.Option<boolean> =>
  getMetadata<boolean>(profile.node, "blocked_by_viewer");

export const followsViewer = (profile: ProfileData): Option.Option<boolean> =>
  getMetadata<boolean>(profile.node, "follows_viewer");

export const fullName = (profile: ProfileData): Option.Option<string> =>
  getMetadata<string>(profile.node, "full_name");

export const hasBlockedViewer = (profile: ProfileData): Option.Option<boolean> =>
  getMetadata<boolean>(profile.node, "has_blocked_viewer");

export const hasHighlightReels = (_profile: ProfileData): boolean => true;

export const hasRequestedViewer = (profile: ProfileData): Option.Option<boolean> =>
  getMetadata<boolean>(profile.node, "has_requested_viewer");

export const isVerified = (profile: ProfileData): Option.Option<boolean> =>
  getMetadata<boolean>(profile.node, "is_verified");

export const requestedByViewer = (profile: ProfileData): Option.Option<boolean> =>
  getMetadata<boolean>(profile.node, "requested_by_viewer");

export const profilePicUrl = (profile: ProfileData): Option.Option<string> =>
  getMetadata<string>(profile.node, "profile_pic_url_hd");

export const getIphoneStruct = (
  context: InstaloaderContextShape,
  profile: ProfileData
): Effect.Effect<JsonNode, ProfileError | IPhoneSupportDisabledError | LoginRequiredError> =>
  Effect.gen(function* () {
    const iphoneSupport = context.options.iphoneSupport;
    if (!iphoneSupport) {
      return yield* Effect.fail(
        new IPhoneSupportDisabledError({ message: "iPhone support is disabled." })
      );
    }
    const loggedIn = yield* context.isLoggedIn;
    if (!loggedIn) {
      return yield* Effect.fail(
        new LoginRequiredError({ message: "Login required to access iPhone profile info endpoint." })
      );
    }
    if (profile.iphoneStruct) {
      return profile.iphoneStruct;
    }
    const data = yield* context.getIphoneJson(`api/v1/users/${userid(profile)}/info/`, {});
    return data["user"] as JsonNode;
  });

export const getProfilePicUrl = (
  context: InstaloaderContextShape,
  profile: ProfileData
): Effect.Effect<string, ProfileError | IPhoneSupportDisabledError | LoginRequiredError> =>
  Effect.gen(function* () {
    const iphoneSupport = context.options.iphoneSupport;
    const loggedIn = yield* context.isLoggedIn;

    if (iphoneSupport && loggedIn) {
      const result = yield* Effect.either(getIphoneStruct(context, profile));
      if (result._tag === "Right") {
        const hdPicInfo = result.right["hd_profile_pic_url_info"] as JsonNode | undefined;
        if (hdPicInfo) {
          return hdPicInfo["url"] as string;
        }
      }
    }

    const picUrl = profilePicUrl(profile);
    if (Option.isNone(picUrl)) {
      return yield* Effect.fail(
        new ProfileNotExistsError({ message: "Profile pic URL not available" })
      );
    }
    return picUrl.value;
  });

export const getHasPublicStory = (
  context: InstaloaderContextShape,
  profile: ProfileData
): Effect.Effect<boolean, ProfileError> =>
  Effect.gen(function* () {
    const data = yield* context.graphqlQuery(
      "9ca88e465c3f866a76f7adee3871bdd8",
      {
        user_id: userid(profile),
        include_chaining: false,
        include_reel: false,
        include_suggested_users: false,
        include_logged_out_extras: true,
        include_highlight_reels: false,
      },
      `https://www.instagram.com/${username(profile)}/`
    );
    return ((data["data"] as JsonNode)["user"] as JsonNode)["has_public_story"] as boolean;
  });

export const toDict = (profile: ProfileData): JsonNode => {
  const jsonNode = { ...profile.node };
  delete jsonNode["edge_media_collections"];
  delete jsonNode["edge_owner_to_timeline_media"];
  delete jsonNode["edge_saved_media"];
  delete jsonNode["edge_felix_video_timeline"];
  if (profile.iphoneStruct) {
    jsonNode["iphone_struct"] = profile.iphoneStruct;
  }
  return jsonNode;
};

type HasDateLocal = { dateLocal: Date };

const isNewestChecker = (item: HasDateLocal, first: HasDateLocal | null): boolean =>
  first === null || item.dateLocal > first.dateLocal;

export const getPostsStream = <T>(
  context: InstaloaderContextShape,
  profile: ProfileData,
  nodeWrapper: (node: JsonNode, profile: ProfileData) => T
): Effect.Effect<Stream.Stream<T, NodeIteratorError>, never> =>
  Effect.gen(function* () {
    const loggedInRef = yield* Ref.make<boolean | null>(null);

    return Stream.unwrap(
      Effect.gen(function* () {
        let loggedIn = yield* Ref.get(loggedInRef);
        if (loggedIn === null) {
          loggedIn = yield* context.isLoggedIn;
          yield* Ref.set(loggedInRef, loggedIn);
        }

        const queryHash = loggedIn ? null : "7950326061742207";
        const docId = loggedIn ? "7898261790222653" : null;

        const config: NodeIteratorConfig<T> = {
          context,
          queryHash,
          docId,
          edgeExtractor: loggedIn
            ? (d: JsonNode) => (d["data"] as JsonNode)["xdt_api__v1__feed__user_timeline_graphql_connection"] as JsonNode
            : (d: JsonNode) => ((d["data"] as JsonNode)["user"] as JsonNode)["edge_owner_to_timeline_media"] as JsonNode,
          nodeWrapper: (n: JsonNode) => nodeWrapper(n, profile),
          queryVariables: {
            data: {
              count: 12,
              include_relationship_info: true,
              latest_besties_reel_media: true,
              latest_reel_media: true,
            },
            ...(loggedIn ? { username: username(profile) } : { id: userid(profile) }),
          },
          queryReferer: `https://www.instagram.com/${username(profile)}/`,
          firstData: loggedIn ? null : (profile.node["edge_owner_to_timeline_media"] as JsonNode | null) ?? null,
          isFirst: isNewestChecker as (item: T, first: T | null) => boolean,
        };

        return createNodeStream(config);
      })
    );
  });

export const getSavedPostsStream = <T>(
  context: InstaloaderContextShape,
  profile: ProfileData,
  nodeWrapper: (node: JsonNode) => T
): Effect.Effect<Stream.Stream<T, NodeIteratorError>, LoginRequiredError> =>
  Effect.gen(function* () {
    const contextUsername = yield* context.getUsername;
    if (username(profile) !== contextUsername) {
      return yield* Effect.fail(
        new LoginRequiredError({
          message: `Login as ${username(profile)} required to get that profile's saved posts.`,
        })
      );
    }

    const config: NodeIteratorConfig<T> = {
      context,
      queryHash: "f883d95537fbcd400f466f63d42bd8a1",
      docId: null,
      edgeExtractor: (d: JsonNode) => ((d["data"] as JsonNode)["user"] as JsonNode)["edge_saved_media"] as JsonNode,
      nodeWrapper,
      queryVariables: { id: userid(profile) },
      queryReferer: `https://www.instagram.com/${username(profile)}/`,
      firstData: null,
      isFirst: null,
    };

    return createNodeStream(config);
  });

export const getTaggedPostsStream = <T>(
  context: InstaloaderContextShape,
  profile: ProfileData,
  nodeWrapper: (node: JsonNode, ownerProfile: ProfileData | null) => T
): Stream.Stream<T, NodeIteratorError> => {
  const profileId = userid(profile);

  const config: NodeIteratorConfig<T> = {
    context,
    queryHash: "e31a871f7301132ceaab56507a66bbb7",
    docId: null,
    edgeExtractor: (d: JsonNode) => ((d["data"] as JsonNode)["user"] as JsonNode)["edge_user_to_photos_of_you"] as JsonNode,
    nodeWrapper: (n: JsonNode) => {
      const ownerId = Number((n["owner"] as JsonNode)["id"]);
      return nodeWrapper(n, ownerId === profileId ? profile : null);
    },
    queryVariables: { id: profileId },
    queryReferer: `https://www.instagram.com/${username(profile)}/`,
    firstData: null,
    isFirst: isNewestChecker as (item: T, first: T | null) => boolean,
  };

  return createNodeStream(config);
};

export const getReelsStream = <T>(
  context: InstaloaderContextShape,
  profile: ProfileData,
  nodeWrapper: (node: JsonNode) => T
): Stream.Stream<T, NodeIteratorError> => {
  const config: NodeIteratorConfig<T> = {
    context,
    queryHash: null,
    docId: "7845543455542541",
    edgeExtractor: (d: JsonNode) => (d["data"] as JsonNode)["xdt_api__v1__clips__user__connection_v2"] as JsonNode,
    nodeWrapper: (n: JsonNode) => nodeWrapper((n["media"] as JsonNode)),
    queryVariables: {
      data: {
        page_size: 12,
        include_feed_video: true,
        target_user_id: String(userid(profile)),
      },
    },
    queryReferer: `https://www.instagram.com/${username(profile)}/`,
    firstData: null,
    isFirst: isNewestChecker as (item: T, first: T | null) => boolean,
  };

  return createNodeStream(config);
};

export const getIgtvPostsStream = <T>(
  context: InstaloaderContextShape,
  profile: ProfileData,
  nodeWrapper: (node: JsonNode, profile: ProfileData) => T
): Stream.Stream<T, NodeIteratorError> => {
  const config: NodeIteratorConfig<T> = {
    context,
    queryHash: "bc78b344a68ed16dd5d7f264681c4c76",
    docId: null,
    edgeExtractor: (d: JsonNode) => ((d["data"] as JsonNode)["user"] as JsonNode)["edge_felix_video_timeline"] as JsonNode,
    nodeWrapper: (n: JsonNode) => nodeWrapper(n, profile),
    queryVariables: { id: userid(profile) },
    queryReferer: `https://www.instagram.com/${username(profile)}/channel/`,
    firstData: (profile.node["edge_felix_video_timeline"] as JsonNode | null) ?? null,
    isFirst: isNewestChecker as (item: T, first: T | null) => boolean,
  };

  return createNodeStream(config);
};
