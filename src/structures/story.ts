import { Effect, Option } from "effect";
import { type InstaloaderContextShape } from "../core/context.ts";
import {
  AbortDownloadError,
  BadResponseError,
  IPhoneSupportDisabledError,
  LoginRequiredError,
  type InstaloaderErrors,
} from "../exceptions/index.ts";
import {
  HASHTAG_REGEX,
  MENTION_REGEX,
  optionalNormalize,
  type JsonNode,
} from "./common.ts";
import { mediaidToShortcodeSync } from "./post.ts";
import {
  type ProfileData,
  fromId as profileFromId,
  userid as profileUserid,
  username as profileUsername,
  toDict as profileToDict,
} from "./profile.ts";

export type StoryError = InstaloaderErrors | AbortDownloadError;

export interface StoryItemData {
  readonly node: JsonNode;
  readonly ownerProfile: ProfileData | null;
  readonly iphoneStruct: JsonNode | null;
}

export interface StoryData {
  readonly node: JsonNode;
  readonly uniqueId: string | null;
  readonly ownerProfile: ProfileData | null;
  readonly iphoneStruct: JsonNode | null;
}

export const fromMediaidEffect = (
  context: InstaloaderContextShape,
  mediaid: number
): Effect.Effect<StoryItemData, StoryError> =>
  Effect.gen(function* () {
    const shortcode = mediaidToShortcodeSync(mediaid);
    const picJson = yield* context.graphqlQuery(
      "2b0673e0dc4580674a88d426fe00ea90",
      { shortcode }
    );
    const shortcodeMedia = (picJson["data"] as JsonNode)["shortcode_media"] as JsonNode | null;
    if (shortcodeMedia === null) {
      return yield* Effect.fail(new BadResponseError({ message: "Fetching StoryItem metadata failed." }));
    }
    return {
      node: shortcodeMedia,
      ownerProfile: null,
      iphoneStruct: null,
    };
  });

export const storyItemFromNode = (node: JsonNode, ownerProfile?: ProfileData): StoryItemData => {
  const iphoneStruct = "iphone_struct" in node ? (node["iphone_struct"] as JsonNode) : null;
  return {
    node,
    ownerProfile: ownerProfile ?? null,
    iphoneStruct,
  };
};

export const storyItemMediaid = (item: StoryItemData): number =>
  Number(item.node["id"]);

export const storyItemShortcode = (item: StoryItemData): string =>
  mediaidToShortcodeSync(storyItemMediaid(item));

export const storyItemToString = (item: StoryItemData): string =>
  `<StoryItem ${storyItemMediaid(item)}>`;

export const storyItemEquals = (item1: StoryItemData, item2: StoryItemData): boolean =>
  storyItemMediaid(item1) === storyItemMediaid(item2);

export const storyItemToDict = (item: StoryItemData): JsonNode => {
  const node = { ...item.node };
  if (item.ownerProfile) {
    node["owner"] = profileToDict(item.ownerProfile);
  }
  if (item.iphoneStruct) {
    node["iphone_struct"] = item.iphoneStruct;
  }
  return node;
};

export const storyItemOwnerProfile = (item: StoryItemData): Option.Option<ProfileData> => {
  if (item.ownerProfile) {
    return Option.some(item.ownerProfile);
  }
  return Option.none();
};

export const storyItemOwnerUsername = (item: StoryItemData): Option.Option<string> =>
  Option.map(storyItemOwnerProfile(item), profileUsername);

export const storyItemOwnerId = (item: StoryItemData): Option.Option<number> =>
  Option.map(storyItemOwnerProfile(item), profileUserid);

export const storyItemDateLocal = (item: StoryItemData): Date => {
  const timestamp = item.node["taken_at_timestamp"] as number;
  return new Date(timestamp * 1000);
};

export const storyItemDateUtc = (item: StoryItemData): Date => {
  const timestamp = item.node["taken_at_timestamp"] as number;
  return new Date(timestamp * 1000);
};

export const storyItemDate = (item: StoryItemData): Date =>
  storyItemDateUtc(item);

export const storyItemProfile = (item: StoryItemData): Option.Option<string> =>
  storyItemOwnerUsername(item);

export const storyItemExpiringLocal = (item: StoryItemData): Date => {
  const timestamp = item.node["expiring_at_timestamp"] as number;
  return new Date(timestamp * 1000);
};

export const storyItemExpiringUtc = (item: StoryItemData): Date => {
  const timestamp = item.node["expiring_at_timestamp"] as number;
  return new Date(timestamp * 1000);
};

export const storyItemUrl = (item: StoryItemData): string => {
  const displayResources = item.node["display_resources"] as JsonNode[];
  const lastResource = displayResources[displayResources.length - 1];
  return lastResource ? (lastResource["src"] as string) : "";
};

export const storyItemTypename = (item: StoryItemData): string =>
  item.node["__typename"] as string;

export const storyItemCaption = (item: StoryItemData): string | null => {
  if ("edge_media_to_caption" in item.node) {
    const captionData = item.node["edge_media_to_caption"] as JsonNode;
    const edges = captionData["edges"] as JsonNode[];
    if (edges.length > 0) {
      const firstEdge = edges[0];
      if (firstEdge) {
        const text = (firstEdge["node"] as JsonNode)["text"] as string;
        return optionalNormalize(text);
      }
    }
  } else if ("caption" in item.node) {
    const cap = item.node["caption"];
    if (typeof cap === "string") {
      return optionalNormalize(cap);
    } else if (cap && typeof cap === "object" && "text" in cap) {
      return optionalNormalize((cap as JsonNode)["text"] as string);
    }
    return null;
  }
  return null;
};

export const storyItemCaptionHashtags = (item: StoryItemData): string[] => {
  const cap = storyItemCaption(item);
  if (!cap) return [];
  const matches = cap.toLowerCase().matchAll(HASHTAG_REGEX);
  return Array.from(matches, (m) => m[1]).filter((s): s is string => s !== undefined);
};

export const storyItemCaptionMentions = (item: StoryItemData): string[] => {
  const cap = storyItemCaption(item);
  if (!cap) return [];
  const matches = cap.toLowerCase().matchAll(MENTION_REGEX);
  return Array.from(matches, (m) => m[1]).filter((s): s is string => s !== undefined);
};

export const storyItemPcaption = (item: StoryItemData): string => {
  const cap = storyItemCaption(item);
  if (!cap) return "";
  const processed = cap
    .split("\n")
    .filter((s) => s)
    .map((s) => s.replace("/", "\u2215"))
    .join(" ")
    .trim();
  return processed.length > 31 ? processed.slice(0, 30) + "\u2026" : processed;
};

export const storyItemIsVideo = (item: StoryItemData): boolean =>
  item.node["is_video"] as boolean;

export const storyItemVideoUrl = (item: StoryItemData): string | null => {
  if (!storyItemIsVideo(item)) return null;
  const videoResources = item.node["video_resources"] as JsonNode[] | undefined;
  if (videoResources && videoResources.length > 0) {
    const lastResource = videoResources[videoResources.length - 1];
    return lastResource ? (lastResource["src"] as string) : null;
  }
  return null;
};

export const storyItemGetIphoneStruct = (
  context: InstaloaderContextShape,
  item: StoryItemData
): Effect.Effect<JsonNode, StoryError | IPhoneSupportDisabledError | LoginRequiredError> =>
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
    if (item.iphoneStruct) {
      return item.iphoneStruct;
    }

    const ownerId = storyItemOwnerId(item);
    const data = yield* context.getIphoneJson(
      `api/v1/feed/reels_media/?reel_ids=${ownerId}`,
      {}
    );
    const reels = data["reels"] as JsonNode;
    const ownerReel = reels[String(ownerId)] as JsonNode;
    const items = ownerReel["items"] as JsonNode[];

    for (const reelItem of items) {
      if (Number(reelItem["pk"]) === storyItemMediaid(item)) {
        return reelItem;
      }
    }
    return {};
  });

export const storyItemGetOwnerProfile = (
  context: InstaloaderContextShape,
  item: StoryItemData
): Effect.Effect<ProfileData, StoryError> =>
  Effect.gen(function* () {
    if (item.ownerProfile) {
      return item.ownerProfile;
    }
    const owner = item.node["owner"] as JsonNode;
    return yield* profileFromId(context, Number(owner["id"]));
  });

export const storyItemGetOwnerUsername = (
  context: InstaloaderContextShape,
  item: StoryItemData
): Effect.Effect<string, StoryError> =>
  Effect.gen(function* () {
    const profile = yield* storyItemGetOwnerProfile(context, item);
    return profileUsername(profile);
  });

export const storyItemGetOwnerId = (
  context: InstaloaderContextShape,
  item: StoryItemData
): Effect.Effect<number, StoryError> =>
  Effect.gen(function* () {
    const profile = yield* storyItemGetOwnerProfile(context, item);
    return profileUserid(profile);
  });

export const storyItemGetUrl = (
  context: InstaloaderContextShape,
  item: StoryItemData
): Effect.Effect<string, StoryError> =>
  Effect.gen(function* () {
    const typenameVal = storyItemTypename(item);
    const loggedIn = yield* context.isLoggedIn;

    if (
      (typenameVal === "GraphStoryImage" || typenameVal === "StoryImage") &&
      context.options.iphoneSupport &&
      loggedIn
    ) {
      const result = yield* Effect.either(storyItemGetIphoneStruct(context, item));
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
    return storyItemUrl(item);
  });

export const storyItemGetVideoUrl = (
  context: InstaloaderContextShape,
  item: StoryItemData
): Effect.Effect<string | null, StoryError> =>
  Effect.gen(function* () {
    if (!storyItemIsVideo(item)) {
      return null;
    }

    const versionUrls: string[] = [];

    const videoResources = item.node["video_resources"] as JsonNode[] | undefined;
    if (videoResources && videoResources.length > 0) {
      const lastResource = videoResources[videoResources.length - 1];
      if (lastResource) {
        versionUrls.push(lastResource["src"] as string);
      }
    }

    const loggedIn = yield* context.isLoggedIn;
    if (context.options.iphoneSupport && loggedIn) {
      const iphoneResult = yield* Effect.either(storyItemGetIphoneStruct(context, item));
      if (iphoneResult._tag === "Right") {
        const videoVersions = iphoneResult.right["video_versions"] as JsonNode[] | undefined;
        if (videoVersions) {
          for (const version of videoVersions) {
            versionUrls.push(version["url"] as string);
          }
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

export const storyFromNode = (node: JsonNode): StoryData => ({
  node,
  uniqueId: null,
  ownerProfile: null,
  iphoneStruct: null,
});

export const storyOwnerProfile = (story: StoryData): ProfileData => {
  if (story.ownerProfile) {
    return story.ownerProfile;
  }
  const user = story.node["user"] as JsonNode;
  return { node: user, iphoneStruct: null };
};

export const storyOwnerUsername = (story: StoryData): string =>
  profileUsername(storyOwnerProfile(story));

export const storyOwnerId = (story: StoryData): number =>
  profileUserid(storyOwnerProfile(story));

export const storyLastSeenLocal = (story: StoryData): Date | null => {
  const seen = story.node["seen"] as number | null;
  if (seen) {
    return new Date(seen * 1000);
  }
  return null;
};

export const storyLastSeenUtc = (story: StoryData): Date | null => {
  const seen = story.node["seen"] as number | null;
  if (seen) {
    return new Date(seen * 1000);
  }
  return null;
};

export const storyLatestMediaLocal = (story: StoryData): Date => {
  const timestamp = story.node["latest_reel_media"] as number;
  return new Date(timestamp * 1000);
};

export const storyLatestMediaUtc = (story: StoryData): Date => {
  const timestamp = story.node["latest_reel_media"] as number;
  return new Date(timestamp * 1000);
};

export const storyItemcount = (story: StoryData): number => {
  const items = story.node["items"] as JsonNode[];
  return items.length;
};

export const storyUniqueId = (story: StoryData): string => {
  if (story.uniqueId) {
    return story.uniqueId;
  }
  const idList: number[] = [];
  const items = story.node["items"] as JsonNode[];
  for (const item of items) {
    idList.push(Number(item["id"]));
  }
  idList.sort((a, b) => a - b);
  return String(storyOwnerId(story)) + idList.join("");
};

export const storyToString = (story: StoryData): string => {
  const date = storyLatestMediaUtc(story);
  const formatted = date.toISOString().replace(/[:.]/g, "-").slice(0, -5);
  return `<Story by ${storyOwnerUsername(story)} changed ${formatted}_UTC>`;
};

export const storyEquals = (story1: StoryData, story2: StoryData): boolean =>
  storyUniqueId(story1) === storyUniqueId(story2);

export const storyGetItemsSync = (story: StoryData): StoryItemData[] => {
  const items = story.node["items"] as JsonNode[];
  const result: StoryItemData[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item) {
      result.push(storyItemFromNode(item, storyOwnerProfile(story)));
    }
  }
  return result;
};

export const storyFetchIphoneStruct = (
  context: InstaloaderContextShape,
  story: StoryData
): Effect.Effect<JsonNode | null, StoryError> =>
  Effect.gen(function* () {
    const loggedIn = yield* context.isLoggedIn;
    if (!context.options.iphoneSupport || !loggedIn) {
      return null;
    }
    if (story.iphoneStruct) {
      return story.iphoneStruct;
    }
    const data = yield* context.getIphoneJson(
      `api/v1/feed/reels_media/?reel_ids=${storyOwnerId(story)}`,
      {}
    );
    const reels = data["reels"] as JsonNode;
    return reels[String(storyOwnerId(story))] as JsonNode;
  });

export const storyGetItems = (
  context: InstaloaderContextShape,
  story: StoryData
): Effect.Effect<StoryItemData[], StoryError> =>
  Effect.gen(function* () {
    const iphoneStruct = yield* storyFetchIphoneStruct(context, story);
    const items = story.node["items"] as JsonNode[];
    const result: StoryItemData[] = [];

    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (!item) continue;

      let itemIphoneStruct: JsonNode | null = null;
      if (iphoneStruct) {
        const iphoneItems = iphoneStruct["items"] as JsonNode[];
        for (const iphoneItem of iphoneItems) {
          if (Number(iphoneItem["pk"]) === Number(item["id"])) {
            itemIphoneStruct = iphoneItem;
            break;
          }
        }
      }

      result.push({
        node: itemIphoneStruct ? { ...item, iphone_struct: itemIphoneStruct } : item,
        ownerProfile: storyOwnerProfile(story),
        iphoneStruct: itemIphoneStruct,
      });
    }

    return result;
  });
