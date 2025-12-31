import { Effect, Option } from "effect";
import { type InstaloaderContextShape } from "../core/context.ts";
import {
  AbortDownloadError,
  BadResponseError,
  IPhoneSupportDisabledError,
  InvalidArgumentError,
  LoginRequiredError,
  PostChangedError,
  type InstaloaderErrors,
} from "../exceptions/index.ts";
import {
  HASHTAG_REGEX,
  MENTION_REGEX,
  optionalNormalize,
  type JsonNode,
  type PostLocation,
  type PostSidecarNode,
} from "./common.ts";
import {
  type ProfileData,
  fromIphoneStruct as profileFromIphoneStruct,
  userid as profileUserid,
  username as profileUsername,
  toDict as profileToDict,
} from "./profile.ts";

export type PostError = InstaloaderErrors | AbortDownloadError;

const MEDIA_TYPES: Record<number, string> = {
  1: "GraphImage",
  2: "GraphVideo",
  8: "GraphSidecar",
};

const XDT_TYPES: Record<string, string> = {
  XDTGraphImage: "GraphImage",
  XDTGraphVideo: "GraphVideo",
  XDTGraphSidecar: "GraphSidecar",
};

export interface PostData {
  readonly node: JsonNode;
  readonly ownerProfile: ProfileData | null;
  readonly fullMetadataDict: JsonNode | null;
  readonly location: PostLocation | null;
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

const fieldOption = <T>(post: PostData, ...keys: string[]): Option.Option<T> => {
  const tryNode = getMetadata<T>(post.node, ...keys);
  if (Option.isSome(tryNode)) {
    return tryNode;
  }

  if (!post.fullMetadataDict) {
    return Option.none();
  }
  return getMetadata<T>(post.fullMetadataDict, ...keys);
};

const field = <T>(post: PostData, ...keys: string[]): T =>
  Option.getOrThrow(fieldOption<T>(post, ...keys));

export const shortcodeToMediaid = (code: string): Effect.Effect<bigint, InvalidArgumentError> =>
  Effect.gen(function* () {
    if (code.length > 11) {
      return yield* Effect.fail(
        new InvalidArgumentError({
          message: `Wrong shortcode "${code}", unable to convert to mediaid.`,
        })
      );
    }
    const padded = "A".repeat(12 - code.length) + code;
    const b64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const bytes: number[] = [];
    for (let i = 0; i < padded.length; i += 4) {
      const chunk = padded.slice(i, i + 4);
      let val = 0;
      for (const char of chunk) {
        val = val * 64 + b64Alphabet.indexOf(char);
      }
      bytes.push((val >> 16) & 0xff, (val >> 8) & 0xff, val & 0xff);
    }
    let result = 0n;
    for (const byte of bytes) {
      result = (result << 8n) | BigInt(byte);
    }
    return result;
  });

export const mediaidToShortcode = (mediaid: bigint | number): Effect.Effect<string, InvalidArgumentError> =>
  Effect.gen(function* () {
    let id = typeof mediaid === "bigint" ? mediaid : BigInt(mediaid);
    if (id < 0n || id >= 2n ** 64n) {
      return yield* Effect.fail(
        new InvalidArgumentError({
          message: `Wrong mediaid ${mediaid}, unable to convert to shortcode`,
        })
      );
    }
    const bytes: number[] = [];
    for (let i = 0; i < 9; i++) {
      bytes.unshift(Number(id & 0xffn));
      id = id >> 8n;
    }
    const b64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let result = "";
    for (let i = 0; i < 9; i += 3) {
      const val = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
      result += b64Alphabet[(val >> 18) & 0x3f];
      result += b64Alphabet[(val >> 12) & 0x3f];
      result += b64Alphabet[(val >> 6) & 0x3f];
      result += b64Alphabet[val & 0x3f];
    }
    return result.replace(/^A+/, "") || "A";
  });

export const shortcodeToMediaidSync = (code: string): bigint =>
  Effect.runSync(shortcodeToMediaid(code));

export const mediaidToShortcodeSync = (mediaid: bigint | number): string =>
  Effect.runSync(mediaidToShortcode(mediaid));

export const fromShortcodeEffect = (
  context: InstaloaderContextShape,
  shortcode: string
): Effect.Effect<PostData, PostError> =>
  Effect.gen(function* () {
    const picJson = yield* context.docIdGraphqlQuery(
      "8845758582119845",
      { shortcode }
    );
    const data = (picJson["data"] as JsonNode)["xdt_shortcode_media"] as JsonNode | null;
    if (data === null) {
      return yield* Effect.fail(new BadResponseError({ message: "Fetching Post metadata failed." }));
    }
    const typename = data["__typename"] as string;
    if (typename in XDT_TYPES) {
      data["__typename"] = XDT_TYPES[typename];
    } else {
      return yield* Effect.fail(
        new BadResponseError({ message: `Unknown __typename in metadata: ${typename}.` })
      );
    }

    const iphoneStruct = "iphone_struct" in data ? (data["iphone_struct"] as JsonNode | null) : null;
    const ownerProfile = "owner" in data && (data["owner"] as JsonNode)["username"]
      ? { node: data["owner"] as JsonNode, iphoneStruct: null }
      : null;

    return {
      node: data,
      ownerProfile,
      fullMetadataDict: data,
      location: null,
      iphoneStruct,
    };
  });

export const fromMediaidEffect = (
  context: InstaloaderContextShape,
  mediaid: number
): Effect.Effect<PostData, PostError | InvalidArgumentError> =>
  Effect.gen(function* () {
    const shortcode = yield* mediaidToShortcode(mediaid);
    return yield* fromShortcodeEffect(context, shortcode);
  });

const convertIphoneCarousel = (iphoneNode: JsonNode): JsonNode => {
  const mediaType = iphoneNode["media_type"] as number;
  const imageVersions = iphoneNode["image_versions2"] as JsonNode | undefined;
  const candidates = imageVersions?.["candidates"] as JsonNode[] | undefined;

  const fakeNode: JsonNode = {
    display_url: candidates?.[0]?.["url"] ?? "",
    is_video: MEDIA_TYPES[mediaType] === "GraphVideo",
  };

  const videoVersions = iphoneNode["video_versions"] as JsonNode[] | undefined;
  if (videoVersions && videoVersions.length > 0 && videoVersions[0]) {
    fakeNode["video_url"] = videoVersions[0]["url"];
  }

  return fakeNode;
};

export const fromIphoneStruct = (media: JsonNode): PostData => {
  const mediaType = media["media_type"] as number;
  const typename = MEDIA_TYPES[mediaType];

  const fakeNode: JsonNode = {
    shortcode: media["code"],
    id: media["pk"],
    __typename: typename,
    is_video: typename === "GraphVideo",
    date: media["taken_at"],
    caption: (media["caption"] as JsonNode | null)?.["text"] ?? null,
    title: media["title"] ?? null,
    viewer_has_liked: media["has_liked"],
    edge_media_preview_like: { count: media["like_count"] },
    accessibility_caption: media["accessibility_caption"] ?? null,
    comments: media["comment_count"] ?? 0,
    iphone_struct: media,
  };

  const imageVersions = media["image_versions2"] as JsonNode | undefined;
  if (imageVersions) {
    const candidates = imageVersions["candidates"] as JsonNode[] | undefined;
    if (candidates && candidates.length > 0 && candidates[0]) {
      fakeNode["display_url"] = candidates[0]["url"];
    }
  }

  const videoVersions = media["video_versions"] as JsonNode[] | undefined;
  if (videoVersions && videoVersions.length > 0) {
    const lastVersion = videoVersions[videoVersions.length - 1];
    if (lastVersion) {
      fakeNode["video_url"] = lastVersion["url"];
    }
    fakeNode["video_duration"] = media["video_duration"];
    fakeNode["video_view_count"] = media["view_count"];
  }

  const carouselMedia = media["carousel_media"] as JsonNode[] | undefined;
  if (carouselMedia) {
    fakeNode["edge_sidecar_to_children"] = {
      edges: carouselMedia.map((node) => ({
        node: convertIphoneCarousel(node),
      })),
    };
  }

  const ownerProfile = "user" in media
    ? profileFromIphoneStruct(media["user"] as JsonNode)
    : null;

  return {
    node: fakeNode,
    ownerProfile,
    fullMetadataDict: null,
    location: null,
    iphoneStruct: media,
  };
};

export const fromNode = (node: JsonNode, ownerProfile?: ProfileData): Effect.Effect<PostData, InvalidArgumentError> =>
  Effect.gen(function* () {
    if (!("shortcode" in node) && !("code" in node)) {
      return yield* Effect.fail(
        new InvalidArgumentError({ message: "Post node must contain 'shortcode' or 'code'" })
      );
    }

    const iphoneStruct = "iphone_struct" in node ? (node["iphone_struct"] as JsonNode) : null;

    return {
      node,
      ownerProfile: ownerProfile ?? null,
      fullMetadataDict: null,
      location: null,
      iphoneStruct,
    };
  });

export const fromNodeSync = (node: JsonNode, ownerProfile?: ProfileData): PostData =>
  Effect.runSync(fromNode(node, ownerProfile));

export const supportedGraphqlTypes = (): string[] =>
  ["GraphImage", "GraphVideo", "GraphSidecar"];

export const shortcode = (post: PostData): string =>
  (post.node["shortcode"] ?? post.node["code"]) as string;

export const mediaid = (post: PostData): number =>
  Number(post.node["id"]);

export const title = (post: PostData): string | null =>
  Option.getOrNull(getMetadata<string>(post.node, "title"));

export const toString = (post: PostData): string =>
  `<Post ${shortcode(post)}>`;

export const equals = (post1: PostData, post2: PostData): boolean =>
  shortcode(post1) === shortcode(post2);

export const toDict = (post: PostData): JsonNode => {
  const node = { ...post.node };
  if (post.fullMetadataDict) {
    Object.assign(node, post.fullMetadataDict);
  }
  if (post.ownerProfile) {
    node["owner"] = profileToDict(post.ownerProfile);
  }
  if (post.location) {
    node["location"] = { ...post.location };
  }
  if (post.iphoneStruct) {
    node["iphone_struct"] = post.iphoneStruct;
  }
  return node;
};

const getTimestampDateCreated = (post: PostData): Option.Option<number> => {
  if ("date" in post.node) {
    const date = post.node["date"] as number | undefined;
    if (date !== undefined && !isNaN(date)) {
      return Option.some(date);
    }
  }
  if ("taken_at_timestamp" in post.node) {
    const timestamp = post.node["taken_at_timestamp"] as number | undefined;
    if (timestamp !== undefined && !isNaN(timestamp)) {
      return Option.some(timestamp);
    }
  }
  if ("taken_at" in post.node) {
    const takenAt = post.node["taken_at"] as number | undefined;
    if (takenAt !== undefined && !isNaN(takenAt)) {
      return Option.some(takenAt);
    }
  }
  return Option.none();
};

export const dateLocal = (post: PostData): Option.Option<Date> =>
  Option.map(getTimestampDateCreated(post), (ts) => new Date(ts * 1000));

export const dateUtc = (post: PostData): Option.Option<Date> =>
  Option.map(getTimestampDateCreated(post), (ts) => new Date(ts * 1000));

export const date = (post: PostData): Option.Option<Date> =>
  dateUtc(post);

export const url = (post: PostData): string =>
  (post.node["display_url"] as string) ?? (post.node["display_src"] as string);

export const typenameOption = (post: PostData): Option.Option<string> =>
  fieldOption<string>(post, "__typename");

export const typename = (post: PostData): string =>
  Option.getOrThrow(typenameOption(post));

export const isVideo = (post: PostData): boolean =>
  post.node["is_video"] as boolean;

export const mediacountOption = (post: PostData): Option.Option<number> => {
  const typenameOpt = typenameOption(post);
  if (Option.isNone(typenameOpt)) return Option.none();
  if (typenameOpt.value === "GraphSidecar") {
    const edgesOpt = fieldOption<JsonNode[]>(post, "edge_sidecar_to_children", "edges");
    return Option.map(edgesOpt, (edges) => edges.length);
  }
  return Option.some(1);
};

export const mediacount = (post: PostData): number =>
  Option.getOrElse(mediacountOption(post), () => 1);

export const getIsVideos = (post: PostData): boolean[] => {
  const typenameOpt = typenameOption(post);
  if (Option.isSome(typenameOpt) && typenameOpt.value === "GraphSidecar") {
    const edgesOpt = fieldOption<JsonNode[]>(post, "edge_sidecar_to_children", "edges");
    if (Option.isSome(edgesOpt)) {
      return edgesOpt.value.map((edge) => (edge["node"] as JsonNode)["is_video"] as boolean);
    }
  }
  return [isVideo(post)];
};

export const caption = (post: PostData): string | null => {
  if ("edge_media_to_caption" in post.node) {
    const captionData = post.node["edge_media_to_caption"] as JsonNode;
    const edges = captionData["edges"] as JsonNode[];
    if (edges.length > 0) {
      const firstEdge = edges[0];
      if (firstEdge) {
        const text = (firstEdge["node"] as JsonNode)["text"] as string;
        return optionalNormalize(text);
      }
    }
  } else if ("caption" in post.node) {
    const cap = post.node["caption"];
    // Handle both string and object { text: "..." } formats
    if (typeof cap === "string") {
      return optionalNormalize(cap);
    } else if (cap && typeof cap === "object" && "text" in cap) {
      return optionalNormalize((cap as JsonNode)["text"] as string);
    }
    return null;
  }
  return null;
};

export const captionHashtags = (post: PostData): string[] => {
  const cap = caption(post);
  if (!cap) return [];
  const matches = cap.toLowerCase().matchAll(HASHTAG_REGEX);
  return Array.from(matches, (m) => m[1]).filter((s): s is string => s !== undefined);
};

export const captionMentions = (post: PostData): string[] => {
  const cap = caption(post);
  if (!cap) return [];
  const matches = cap.toLowerCase().matchAll(MENTION_REGEX);
  return Array.from(matches, (m) => m[1]).filter((s): s is string => s !== undefined);
};

export const pcaption = (post: PostData): string => {
  const cap = caption(post);
  if (!cap) return "";
  const processed = cap
    .split("\n")
    .filter((s) => s)
    .map((s) => s.replace("/", "\u2215"))
    .join(" ")
    .trim();
  return processed.length > 31 ? processed.slice(0, 30) + "\u2026" : processed;
};

export const accessibilityCaption = (post: PostData): string | null =>
  Option.getOrNull(getMetadata<string>(post.node, "accessibility_caption"));

export const taggedUsers = (post: PostData): string[] => {
  const edgesOpt = fieldOption<JsonNode[]>(post, "edge_media_to_tagged_user", "edges");
  if (Option.isNone(edgesOpt)) return [];
  return edgesOpt.value.map((edge) => {
    const user = (edge["node"] as JsonNode)["user"] as JsonNode;
    return (user["username"] as string).toLowerCase();
  });
};

export const videoUrl = (post: PostData): Option.Option<string> => {
  if (!isVideo(post)) return Option.none();
  return fieldOption<string>(post, "video_url");
};

export const videoViewCount = (post: PostData): Option.Option<number> => {
  if (!isVideo(post)) return Option.none();
  return fieldOption<number>(post, "video_view_count");
};

export const videoPlayCount = (post: PostData): Option.Option<number> => {
  if (!isVideo(post)) return Option.none();
  return fieldOption<number>(post, "video_play_count");
};

export const videoDuration = (post: PostData): Option.Option<number> => {
  if (!isVideo(post)) return Option.none();
  return fieldOption<number>(post, "video_duration");
};

export const likes = (post: PostData): Option.Option<number> =>
  fieldOption<number>(post, "edge_media_preview_like", "count");

export const comments = (post: PostData): Option.Option<number> => {
  if ("comments" in post.node && typeof post.node["comments"] === "number") {
    return Option.some(post.node["comments"] as number);
  }
  const edgeMediaToComment = post.node["edge_media_to_comment"] as JsonNode | undefined;
  if (edgeMediaToComment && "count" in edgeMediaToComment) {
    return Option.some(edgeMediaToComment["count"] as number);
  }
  const result = fieldOption<number>(post, "edge_media_to_parent_comment", "count");
  if (Option.isSome(result)) return result;
  return fieldOption<number>(post, "edge_media_to_comment", "count");
};

export const isSponsored = (post: PostData): boolean => {
  const edgesOpt = fieldOption<JsonNode[]>(post, "edge_media_to_sponsor_user", "edges");
  return Option.isSome(edgesOpt) && edgesOpt.value.length > 0;
};

export const isPinned = (post: PostData): boolean => {
  const pinnedForUsers = post.node["pinned_for_users"] as unknown[] | undefined;
  return pinnedForUsers !== undefined && pinnedForUsers.length > 0;
};

export const ownerProfile = (post: PostData): Option.Option<ProfileData> => {
  if (post.ownerProfile) {
    return Option.some(post.ownerProfile);
  }
  const owner = post.node["owner"] as JsonNode | undefined;
  if (owner && "username" in owner) {
    return Option.some({ node: owner, iphoneStruct: null });
  }
  return Option.none();
};

export const ownerUsername = (post: PostData): Option.Option<string> =>
  Option.map(ownerProfile(post), profileUsername);

export const ownerId = (post: PostData): Option.Option<number> => {
  const owner = post.node["owner"] as JsonNode | undefined;
  if (owner && "id" in owner) {
    return Option.some(Number(owner["id"]));
  }
  return Option.flatMap(ownerProfile(post), (p) => Option.some(profileUserid(p)));
};

export const profile = (post: PostData): Option.Option<string> =>
  ownerUsername(post);

export const viewerHasLiked = (post: PostData, isLoggedIn: boolean): Option.Option<boolean> => {
  if (!isLoggedIn) return Option.none();
  const likesNode = post.node["likes"] as JsonNode | undefined;
  if (likesNode && "viewer_has_liked" in likesNode) {
    return Option.some(likesNode["viewer_has_liked"] as boolean);
  }
  return fieldOption<boolean>(post, "viewer_has_liked");
};

export const obtainMetadata = (
  context: InstaloaderContextShape,
  post: PostData
): Effect.Effect<PostData, PostError> =>
  Effect.gen(function* () {
    if (post.fullMetadataDict) {
      return post;
    }

    const picJson = yield* context.docIdGraphqlQuery(
      "8845758582119845",
      { shortcode: shortcode(post) }
    );
    const data = (picJson["data"] as JsonNode)["xdt_shortcode_media"] as JsonNode | null;
    if (data === null) {
      return yield* Effect.fail(new BadResponseError({ message: "Fetching Post metadata failed." }));
    }
    const typenameVal = data["__typename"] as string;
    if (typenameVal in XDT_TYPES) {
      data["__typename"] = XDT_TYPES[typenameVal];
    } else {
      return yield* Effect.fail(
        new BadResponseError({ message: `Unknown __typename in metadata: ${typenameVal}.` })
      );
    }

    if (shortcode(post) !== data["shortcode"]) {
      const updatedNode = { ...post.node, ...data };
      return yield* Effect.fail(
        new PostChangedError({
          message: "Post shortcode changed.",
          shortcode: shortcode(post),
          cause: { newPost: { ...post, node: updatedNode, fullMetadataDict: data } },
        })
      );
    }

    return {
      ...post,
      fullMetadataDict: data,
    };
  });

export const getIphoneStruct = (
  context: InstaloaderContextShape,
  post: PostData
): Effect.Effect<JsonNode, PostError | IPhoneSupportDisabledError | LoginRequiredError> =>
  Effect.gen(function* () {
    if (!context.options.iphoneSupport) {
      return yield* Effect.fail(
        new IPhoneSupportDisabledError({ message: "iPhone support is disabled." })
      );
    }
    const loggedIn = yield* context.isLoggedIn;
    if (!loggedIn) {
      return yield* Effect.fail(
        new LoginRequiredError({
          message: "Login required to access iPhone media info endpoint.",
        })
      );
    }
    if (post.iphoneStruct) {
      return post.iphoneStruct;
    }
    const data = yield* context.getIphoneJson(
      `api/v1/media/${mediaid(post)}/info/`,
      {}
    );
    const items = data["items"] as JsonNode[] | undefined;
    if (!items || items.length === 0) {
      return yield* Effect.fail(
        new BadResponseError({ message: "No items returned from iPhone API" })
      );
    }
    return items[0]!;
  });

export const getOwnerProfile = (
  context: InstaloaderContextShape,
  post: PostData
): Effect.Effect<ProfileData, PostError> =>
  Effect.gen(function* () {
    if (post.ownerProfile) {
      return post.ownerProfile;
    }

    let ownerStruct: JsonNode;
    const owner = post.node["owner"] as JsonNode | undefined;
    if (owner && "username" in owner) {
      ownerStruct = owner;
    } else {
      const updated = yield* obtainMetadata(context, post);
      ownerStruct = updated.fullMetadataDict!["owner"] as JsonNode;
    }
    return { node: ownerStruct, iphoneStruct: null };
  });

export const getOwnerUsername = (
  context: InstaloaderContextShape,
  post: PostData
): Effect.Effect<string, PostError> =>
  Effect.gen(function* () {
    const profileData = yield* getOwnerProfile(context, post);
    return profileUsername(profileData);
  });

export const getOwnerId = (
  context: InstaloaderContextShape,
  post: PostData
): Effect.Effect<number, PostError> =>
  Effect.gen(function* () {
    const owner = post.node["owner"] as JsonNode | undefined;
    if (owner && "id" in owner) {
      return Number(owner["id"]);
    }
    const profileData = yield* getOwnerProfile(context, post);
    return profileUserid(profileData);
  });

export const getTypename = (
  context: InstaloaderContextShape,
  post: PostData
): Effect.Effect<string, PostError> =>
  Effect.gen(function* () {
    const tryType = fieldOption<string>(post, "__typename");
    if (Option.isSome(tryType)) {
      return tryType.value;
    }
    const updated = yield* obtainMetadata(context, post);
    return typename(updated);
  });

export const getMediacount = (
  context: InstaloaderContextShape,
  post: PostData
): Effect.Effect<number, PostError> =>
  Effect.gen(function* () {
    const typenameVal = yield* getTypename(context, post);
    if (typenameVal === "GraphSidecar") {
      const tryCount = mediacountOption(post);
      if (Option.isSome(tryCount)) {
        return tryCount.value;
      }
      const updated = yield* obtainMetadata(context, post);
      return mediacount(updated);
    }
    return 1;
  });

export const getUrl = (
  context: InstaloaderContextShape,
  post: PostData
): Effect.Effect<string, PostError> =>
  Effect.gen(function* () {
    const loggedIn = yield* context.isLoggedIn;

    if (typename(post) === "GraphImage" && context.options.iphoneSupport && loggedIn) {
      const result = yield* Effect.either(getIphoneStruct(context, post));
      if (result._tag === "Right") {
        const imageVersions = result.right["image_versions2"] as JsonNode | undefined;
        const candidates = imageVersions?.["candidates"] as JsonNode[] | undefined;
        const firstCandidate = candidates?.[0];
        if (firstCandidate) {
          const origUrl = firstCandidate["url"] as string;
          return origUrl.replace(/([?&])se=\d+&?/g, "$1").replace(/&$/, "");
        }
      }
    }
    return url(post);
  });

export const getVideoUrl = (
  context: InstaloaderContextShape,
  post: PostData
): Effect.Effect<string | null, PostError> =>
  Effect.gen(function* () {
    if (!isVideo(post)) {
      return null;
    }

    const versionUrls: string[] = [];

    const tryUrl = fieldOption<string>(post, "video_url");
    if (Option.isSome(tryUrl)) {
      versionUrls.push(tryUrl.value);
    } else {
      const graphqlUrlResult = yield* Effect.either(
        Effect.gen(function* () {
          const updated = yield* obtainMetadata(context, post);
          return Option.getOrThrow(fieldOption<string>(updated, "video_url"));
        })
      );
      if (graphqlUrlResult._tag === "Right") {
        versionUrls.push(graphqlUrlResult.right);
      }
    }

    const loggedIn = yield* context.isLoggedIn;
    if (context.options.iphoneSupport && loggedIn) {
      const iphoneResult = yield* Effect.either(getIphoneStruct(context, post));
      if (iphoneResult._tag === "Right") {
        const videoVersions = iphoneResult.right["video_versions"] as JsonNode[];
        for (const version of videoVersions) {
          versionUrls.push(version["url"] as string);
        }
      }
    }

    const uniqueUrls = [...new Set(versionUrls)];

    if (uniqueUrls.length === 0) {
      return null;
    }
    if (uniqueUrls.length === 1) {
      return uniqueUrls[0] ?? null;
    }

    const candidates: Array<[number, string]> = [];
    for (const videoUrl of uniqueUrls) {
      if (!videoUrl) continue;
      const response = yield* Effect.either(context.head(videoUrl, true));
      if (response._tag === "Right") {
        const contentLength = parseInt(response.right.headers.get("Content-Length") ?? "0", 10);
        candidates.push([contentLength, videoUrl]);
      }
    }

    if (candidates.length === 0) {
      return uniqueUrls[0] ?? null;
    }

    candidates.sort((a, b) => a[0] - b[0]);
    const lastCandidate = candidates[candidates.length - 1];
    return lastCandidate ? lastCandidate[1] : null;
  });

export const getSidecarNodes = (
  context: InstaloaderContextShape,
  post: PostData,
  start = 0,
  end = -1
): Effect.Effect<PostSidecarNode[], PostError> =>
  Effect.gen(function* () {
    if (typename(post) !== "GraphSidecar") {
      return [];
    }

    let edges = field<JsonNode[]>(post, "edge_sidecar_to_children", "edges");
    const actualEnd = end < 0 ? edges.length - 1 : end;
    const actualStart = start < 0 ? edges.length - 1 : start;

    const needsFullMetadata = edges
      .slice(actualStart, actualEnd + 1)
      .some((edge) => {
        const node = edge["node"] as JsonNode;
        return node["is_video"] && !("video_url" in node);
      });

    let updatedPost = post;
    if (needsFullMetadata) {
      updatedPost = yield* obtainMetadata(context, post);
      edges = (updatedPost.fullMetadataDict!["edge_sidecar_to_children"] as JsonNode)["edges"] as JsonNode[];
    }

    const result: PostSidecarNode[] = [];
    const loggedIn = yield* context.isLoggedIn;

    for (let idx = 0; idx < edges.length; idx++) {
      if (idx >= actualStart && idx <= actualEnd) {
        const edgeItem = edges[idx];
        if (!edgeItem) continue;
        const node = edgeItem["node"] as JsonNode;
        const nodeIsVideo = node["is_video"] as boolean;
        let displayUrl = node["display_url"] as string;

        if (!nodeIsVideo && context.options.iphoneSupport && loggedIn) {
          const iphoneResult = yield* Effect.either(getIphoneStruct(context, updatedPost));
          if (iphoneResult._tag === "Right") {
            const carouselMedia = iphoneResult.right["carousel_media"] as JsonNode[] | undefined;
            const carouselItem = carouselMedia?.[idx];
            if (carouselItem) {
              const imageVersions = carouselItem["image_versions2"] as JsonNode | undefined;
              const candidates = imageVersions?.["candidates"] as JsonNode[] | undefined;
              const firstCandidate = candidates?.[0];
              if (firstCandidate) {
                const origUrl = firstCandidate["url"] as string;
                displayUrl = origUrl.replace(/([?&])se=\d+&?/g, "$1").replace(/&$/, "");
              }
            }
          }
        }

        result.push({
          isVideo: nodeIsVideo,
          displayUrl,
          videoUrl: nodeIsVideo ? (node["video_url"] as string) : null,
        });
      }
    }

    return result;
  });

export const getSponsorUsers = (
  post: PostData
): Effect.Effect<ProfileData[], never> =>
  Effect.gen(function* () {
    if (!isSponsored(post)) {
      return [];
    }
    const edges = field<JsonNode[]>(post, "edge_media_to_sponsor_user", "edges");
    return edges.map((edge) => {
      const sponsor = (edge["node"] as JsonNode)["sponsor"] as JsonNode;
      return { node: sponsor, iphoneStruct: null };
    });
  });

export const getLocation = (
  context: InstaloaderContextShape,
  post: PostData
): Effect.Effect<PostLocation | null, PostError | LoginRequiredError> =>
  Effect.gen(function* () {
    if (post.location) {
      return post.location;
    }

    const tryLoc = fieldOption<JsonNode | null>(post, "location");
    let loc: JsonNode | null = null;
    
    if (Option.isSome(tryLoc)) {
      loc = tryLoc.value;
    } else {
      const locResult = yield* Effect.either(
        Effect.gen(function* () {
          const updated = yield* obtainMetadata(context, post);
          return Option.getOrNull(fieldOption<JsonNode | null>(updated, "location"));
        })
      );
      if (locResult._tag === "Right") {
        loc = locResult.right;
      }
    }

    if (!loc) {
      return null;
    }

    const loggedIn = yield* context.isLoggedIn;
    if (!loggedIn) {
      return null;
    }

    const locationId = Number(loc["id"]);
    const requiredKeys = ["name", "slug", "has_public_page", "lat", "lng"];
    const missingKeys = requiredKeys.some((k) => !(k in loc));

    if (missingKeys) {
      const locationData = yield* context.getJson(
        `explore/locations/${locationId}/`,
        { __a: "1", __d: "dis" }
      );
      const locationInfo = (locationData["native_location_data"] as JsonNode)["location_info"] as JsonNode;
      Object.assign(loc, locationInfo);
    }

    return {
      id: locationId,
      name: loc["name"] as string,
      slug: loc["slug"] as string,
      hasPublicPage: loc["has_public_page"] as boolean | null,
      lat: (loc["lat"] as number | null) ?? null,
      lng: (loc["lng"] as number | null) ?? null,
    };
  });
