import { Effect, Option } from "effect";
import { type InstaloaderContextShape, type ContextError } from "../core/context.ts";
import { type JsonNode } from "./common.ts";
import { type ProfileData, userid as profileUserid, username as profileUsername } from "./profile.ts";
import {
  storyItemFromNode,
  type StoryItemData,
} from "./story.ts";

export type HighlightError = ContextError;

export interface HighlightData {
  readonly node: JsonNode;
  readonly ownerProfile: ProfileData | null;
  readonly iphoneStruct: JsonNode | null;
  readonly items: JsonNode[] | null;
}

export const highlightFromNode = (node: JsonNode, ownerProfile?: ProfileData): HighlightData => ({
  node,
  ownerProfile: ownerProfile ?? null,
  iphoneStruct: null,
  items: null,
});

export const highlightUniqueId = (highlight: HighlightData): number =>
  Number(highlight.node["id"]);

export const highlightOwnerProfile = (highlight: HighlightData): ProfileData => {
  if (highlight.ownerProfile) {
    return highlight.ownerProfile;
  }
  const owner = highlight.node["owner"] as JsonNode;
  return { node: owner, iphoneStruct: null };
};

export const highlightOwnerUsername = (highlight: HighlightData): string =>
  profileUsername(highlightOwnerProfile(highlight));

export const highlightOwnerId = (highlight: HighlightData): number =>
  profileUserid(highlightOwnerProfile(highlight));

export const highlightTitle = (highlight: HighlightData): string =>
  highlight.node["title"] as string;

export const highlightCoverUrl = (highlight: HighlightData): string => {
  const coverMedia = highlight.node["cover_media"] as JsonNode;
  return coverMedia["thumbnail_src"] as string;
};

export const highlightCoverCroppedUrl = (highlight: HighlightData): string => {
  const coverMediaCropped = highlight.node["cover_media_cropped_thumbnail"] as JsonNode;
  return coverMediaCropped["url"] as string;
};

export const highlightToString = (highlight: HighlightData): string =>
  `<Highlight by ${highlightOwnerUsername(highlight)}: ${highlightTitle(highlight)}>`;

export const highlightEquals = (h1: HighlightData, h2: HighlightData): boolean =>
  highlightUniqueId(h1) === highlightUniqueId(h2);

export const highlightItemcount = (highlight: HighlightData): Option.Option<number> => {
  if (!highlight.items) {
    return Option.none();
  }
  return Option.some(highlight.items.length);
};

export const highlightFetchItems = (
  context: InstaloaderContextShape,
  highlight: HighlightData
): Effect.Effect<HighlightData, HighlightError> =>
  Effect.gen(function* () {
    if (highlight.items) {
      return highlight;
    }
    const data = yield* context.graphqlQuery(
      "45246d3fe16ccc6577e0bd297a5db1ab",
      {
        reel_ids: [],
        tag_names: [],
        location_ids: [],
        highlight_reel_ids: [String(highlightUniqueId(highlight))],
        precomposed_overlay: false,
      }
    );
    const dataNode = data["data"] as JsonNode | null;
    if (!dataNode) {
      return { ...highlight, items: [] };
    }
    const reelsMedia = dataNode["reels_media"] as JsonNode[] | null;
    if (!reelsMedia || reelsMedia.length === 0) {
      return { ...highlight, items: [] };
    }
    const firstReel = reelsMedia[0] as JsonNode;
    const items = (firstReel["items"] as JsonNode[]) ?? [];
    return { ...highlight, items };
  });

export const highlightFetchIphoneStruct = (
  context: InstaloaderContextShape,
  highlight: HighlightData
): Effect.Effect<HighlightData, HighlightError> =>
  Effect.gen(function* () {
    const loggedIn = yield* context.isLoggedIn;
    if (!context.options.iphoneSupport || !loggedIn) {
      return highlight;
    }
    if (highlight.iphoneStruct) {
      return highlight;
    }
    const uniqueId = highlightUniqueId(highlight);
    const data = yield* context.getIphoneJson(
      `api/v1/feed/reels_media/?reel_ids=highlight:${uniqueId}`,
      {}
    );
    const reels = data["reels"] as JsonNode;
    const iphoneStruct = reels[`highlight:${uniqueId}`] as JsonNode;
    return { ...highlight, iphoneStruct };
  });

export const highlightGetItemcount = (
  context: InstaloaderContextShape,
  highlight: HighlightData
): Effect.Effect<number, HighlightError> =>
  Effect.gen(function* () {
    const updated = yield* highlightFetchItems(context, highlight);
    return updated.items!.length;
  });

export const highlightGetItems = (
  context: InstaloaderContextShape,
  highlight: HighlightData
): Effect.Effect<StoryItemData[], HighlightError> =>
  Effect.gen(function* () {
    const withItems = yield* highlightFetchItems(context, highlight);
    const withIphone = yield* highlightFetchIphoneStruct(context, withItems);

    const result: StoryItemData[] = [];
    for (const item of withIphone.items!) {
      let itemWithIphone = item;
      if (withIphone.iphoneStruct) {
        const iphoneItems = withIphone.iphoneStruct["items"] as JsonNode[];
        for (const iphoneItem of iphoneItems) {
          if (Number(iphoneItem["pk"]) === Number(item["id"])) {
            itemWithIphone = { ...item, iphone_struct: iphoneItem };
            break;
          }
        }
      }
      result.push(storyItemFromNode(itemWithIphone, highlightOwnerProfile(withIphone)));
    }
    return result;
  });
