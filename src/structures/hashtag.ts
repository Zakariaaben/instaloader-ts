import { Effect, Option, Stream } from "effect";
import { type InstaloaderContextShape } from "../core/context.ts";
import { AbortDownloadError, type InstaloaderErrors } from "../exceptions/index.ts";
import { type JsonNode } from "./common.ts";
import { fromIphoneStruct as postFromIphoneStruct, fromNode as postFromNode, type PostData } from "./post.ts";

export type HashtagError = InstaloaderErrors | AbortDownloadError;

export interface HashtagData {
  readonly node: JsonNode;
  readonly hasFullMetadata: boolean;
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

export const fromNameEffect = (
  context: InstaloaderContextShape,
  name: string
): Effect.Effect<HashtagData, HashtagError> =>
  Effect.gen(function* () {
    const normalizedName = name.toLowerCase();
    const jsonResponse = yield* context.getIphoneJson(
      "api/v1/tags/web_info/",
      { tag_name: normalizedName, __a: "1", __d: "dis" }
    );
    let node: JsonNode;
    if ("graphql" in jsonResponse) {
      node = (jsonResponse["graphql"] as JsonNode)["hashtag"] as JsonNode;
    } else {
      node = jsonResponse["data"] as JsonNode;
    }
    return { node, hasFullMetadata: true };
  });

import { InvalidArgumentError } from "../exceptions/index.ts";

export const hashtagFromNode = (node: JsonNode): Effect.Effect<HashtagData, InvalidArgumentError> =>
  Effect.gen(function* () {
    if (!("name" in node)) {
      return yield* Effect.fail(
        new InvalidArgumentError({ message: "Hashtag node must have 'name' property" })
      );
    }
    return { node, hasFullMetadata: false };
  });

export const hashtagName = (hashtag: HashtagData): string =>
  (hashtag.node["name"] as string).toLowerCase();

export const hashtagToString = (hashtag: HashtagData): string =>
  `<Hashtag #${hashtagName(hashtag)}>`;

export const hashtagEquals = (h1: HashtagData, h2: HashtagData): boolean =>
  hashtagName(h1) === hashtagName(h2);

export const hashtagToDict = (hashtag: HashtagData): JsonNode => {
  const jsonNode = { ...hashtag.node };
  delete jsonNode["edge_hashtag_to_top_posts"];
  delete jsonNode["top"];
  delete jsonNode["edge_hashtag_to_media"];
  delete jsonNode["recent"];
  return jsonNode;
};

const queryHashtag = (
  context: InstaloaderContextShape,
  name: string,
  params: Record<string, unknown>
): Effect.Effect<JsonNode, HashtagError> =>
  Effect.gen(function* () {
    const jsonResponse = yield* context.getIphoneJson(
      "api/v1/tags/web_info/",
      { ...params, tag_name: name } as Record<string, string>
    );
    if ("graphql" in jsonResponse) {
      return (jsonResponse["graphql"] as JsonNode)["hashtag"] as JsonNode;
    }
    return jsonResponse["data"] as JsonNode;
  });

export const hashtagObtainMetadata = (
  context: InstaloaderContextShape,
  hashtag: HashtagData
): Effect.Effect<HashtagData, HashtagError> =>
  Effect.gen(function* () {
    if (hashtag.hasFullMetadata) {
      return hashtag;
    }
    const node = yield* queryHashtag(context, hashtagName(hashtag), { __a: "1", __d: "dis" });
    return { node, hasFullMetadata: true };
  });

export const hashtagGetHashtagid = (
  context: InstaloaderContextShape,
  hashtag: HashtagData
): Effect.Effect<number, HashtagError> =>
  Effect.gen(function* () {
    const result = getMetadata<string>(hashtag.node, "id");
    if (Option.isSome(result)) {
      return Number(result.value);
    }
    const updated = yield* hashtagObtainMetadata(context, hashtag);
    return Number(getMetadata<string>(updated.node, "id").pipe(Option.getOrThrow));
  });

export const hashtagGetProfilePicUrl = (
  context: InstaloaderContextShape,
  hashtag: HashtagData
): Effect.Effect<string, HashtagError> =>
  Effect.gen(function* () {
    const result = getMetadata<string>(hashtag.node, "profile_pic_url");
    if (Option.isSome(result)) {
      return result.value;
    }
    const updated = yield* hashtagObtainMetadata(context, hashtag);
    return getMetadata<string>(updated.node, "profile_pic_url").pipe(Option.getOrThrow);
  });

export const hashtagGetDescription = (
  context: InstaloaderContextShape,
  hashtag: HashtagData
): Effect.Effect<string | null, HashtagError> =>
  Effect.gen(function* () {
    const result = getMetadata<string | null>(hashtag.node, "description");
    if (Option.isSome(result)) {
      return result.value;
    }
    const updated = yield* hashtagObtainMetadata(context, hashtag);
    return getMetadata<string | null>(updated.node, "description").pipe(Option.getOrNull);
  });

export const hashtagGetAllowFollowing = (
  context: InstaloaderContextShape,
  hashtag: HashtagData
): Effect.Effect<boolean, HashtagError> =>
  Effect.gen(function* () {
    const result = getMetadata<boolean>(hashtag.node, "allow_following");
    if (Option.isSome(result)) {
      return Boolean(result.value);
    }
    const updated = yield* hashtagObtainMetadata(context, hashtag);
    return Boolean(getMetadata<boolean>(updated.node, "allow_following").pipe(Option.getOrElse(() => false)));
  });

export const hashtagGetIsFollowing = (
  context: InstaloaderContextShape,
  hashtag: HashtagData
): Effect.Effect<boolean, HashtagError> =>
  Effect.gen(function* () {
    const isFollowingResult = getMetadata<boolean>(hashtag.node, "is_following");
    if (Option.isSome(isFollowingResult)) {
      return isFollowingResult.value;
    }
    const followingResult = getMetadata<boolean>(hashtag.node, "following");
    if (Option.isSome(followingResult)) {
      return Boolean(followingResult.value);
    }
    const updated = yield* hashtagObtainMetadata(context, hashtag);
    const updatedIsFollowing = getMetadata<boolean>(updated.node, "is_following");
    if (Option.isSome(updatedIsFollowing)) {
      return updatedIsFollowing.value;
    }
    return Boolean(getMetadata<boolean>(updated.node, "following").pipe(Option.getOrElse(() => false)));
  });

export const hashtagGetMediacount = (
  context: InstaloaderContextShape,
  hashtag: HashtagData
): Effect.Effect<number, HashtagError> =>
  Effect.gen(function* () {
    const countResult = getMetadata<number>(hashtag.node, "edge_hashtag_to_media", "count");
    if (Option.isSome(countResult)) {
      return countResult.value;
    }
    const mediaCountResult = getMetadata<number>(hashtag.node, "media_count");
    if (Option.isSome(mediaCountResult)) {
      return mediaCountResult.value;
    }
    const updated = yield* hashtagObtainMetadata(context, hashtag);
    const updatedCountResult = getMetadata<number>(updated.node, "edge_hashtag_to_media", "count");
    if (Option.isSome(updatedCountResult)) {
      return updatedCountResult.value;
    }
    return getMetadata<number>(updated.node, "media_count").pipe(Option.getOrElse(() => 0));
  });

export const hashtagGetTopPostsStream = (
  context: InstaloaderContextShape,
  hashtag: HashtagData
): Effect.Effect<Stream.Stream<PostData, HashtagError | InvalidArgumentError>, HashtagError> =>
  Effect.gen(function* () {
    const updated = yield* hashtagObtainMetadata(context, hashtag);

    const edgesResult = getMetadata<JsonNode[]>(updated.node, "edge_hashtag_to_top_posts", "edges");
    if (Option.isSome(edgesResult)) {
      return Stream.mapEffect(
        Stream.fromIterable(edgesResult.value),
        (edge) => postFromNode(edge["node"] as JsonNode)
      );
    }

    const topData = getMetadata<JsonNode>(updated.node, "top");
    if (Option.isSome(topData) && "sections" in topData.value) {
      const posts: PostData[] = [];
      const sections = topData.value["sections"] as JsonNode[];
      for (const section of sections) {
        const layoutContent = section["layout_content"] as JsonNode;
        const medias = layoutContent["medias"] as JsonNode[];
        for (const mediaWrapper of medias) {
          const media = mediaWrapper["media"] as JsonNode;
          posts.push(postFromIphoneStruct(media));
        }
      }
      return Stream.fromIterable(posts);
    }

    return Stream.empty;
  });

export const hashtagGetPostsStream = (
  context: InstaloaderContextShape,
  hashtag: HashtagData
): Effect.Effect<Stream.Stream<PostData, HashtagError | InvalidArgumentError>, HashtagError> =>
  Effect.gen(function* () {
    const updated = yield* hashtagObtainMetadata(context, hashtag);
    const name = hashtagName(updated);

    const edgesResult = getMetadata<JsonNode[]>(updated.node, "edge_hashtag_to_media", "edges");
    if (Option.isSome(edgesResult)) {
      const pageInfoResult = getMetadata<JsonNode>(updated.node, "edge_hashtag_to_media", "page_info");
      const initialEdges = edgesResult.value;
      const initialPageInfo: JsonNode = pageInfoResult.pipe(
        Option.getOrElse(() => ({ has_next_page: false } as JsonNode))
      );

      return Stream.flatMap(
        Stream.unfoldEffect(
          { edges: initialEdges, pageInfo: initialPageInfo, index: 0, done: false },
          (state) => {
            if (state.done && state.index >= state.edges.length) {
              return Effect.succeed(Option.none());
            }

            if (state.index < state.edges.length) {
              const edge = state.edges[state.index]!;
              return Effect.succeed(Option.some([edge["node"] as JsonNode, { ...state, index: state.index + 1 }]));
            }

            if (!state.pageInfo["has_next_page"]) {
              return Effect.succeed(Option.none());
            }

            return Effect.gen(function* () {
              const data = yield* queryHashtag(context, name, {
                __a: "1",
                max_id: state.pageInfo["end_cursor"] as string,
              });
              const conn = data["edge_hashtag_to_media"] as JsonNode;
              const newEdges = conn["edges"] as JsonNode[];
              const newPageInfo = conn["page_info"] as JsonNode;

              if (newEdges.length === 0) {
                return Option.none();
              }

              return Option.some([newEdges[0]!["node"] as JsonNode, { edges: newEdges, pageInfo: newPageInfo, index: 1, done: false }]);
            });
          }
        ),
        (node) => Stream.fromEffect(postFromNode(node))
      );
    }

    const recentData = getMetadata<JsonNode>(updated.node, "recent");
    if (Option.isSome(recentData) && "sections" in recentData.value) {
      const posts: PostData[] = [];
      const sections = recentData.value["sections"] as JsonNode[];
      for (const section of sections) {
        const layoutContent = section["layout_content"] as JsonNode;
        const medias = layoutContent["medias"] as JsonNode[];
        for (const mediaWrapper of medias) {
          const media = mediaWrapper["media"] as JsonNode;
          posts.push(postFromIphoneStruct(media));
        }
      }
      return Stream.fromIterable(posts);
    }

    return Stream.empty;
  });
