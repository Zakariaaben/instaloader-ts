import { Effect, Layer, Option, pipe, Stream } from "effect";
import { FileSystem, Path, Error as PlatformError } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import {
  type InstaloaderContextOptions,
  type InstaloaderContextShape,
  type ContextError,
} from "./context.ts";
import {
  AbortDownloadError,
  BadResponseError,
  LoginRequiredError,
} from "../exceptions/index.ts";
import {
  type JsonNode,
  type ProfileData,
  type PostData,
  profileUserid,
  profileUsername,
  storyFromNode,
  type StoryData,
  type StoryItemData,
  highlightFromNode,
  type HighlightData,
  type PostLocation,
  postFromNode,
  postShortcode,
  postMediaid,
  postTypename,
  postDateLocal,
  postDateUtc,
  postUrl,
  postIsVideo,
  postMediacount,
  postToDict,
  postGetSidecarNodes,
  postGetVideoUrl,
  postGetLocation,
  storyItemMediaid,
  storyItemDateLocal,
  storyItemDateUtc,
  storyItemIsVideo,
  storyItemToDict,
  storyItemGetVideoUrl,
  storyItemGetUrl,
  postSupportedGraphqlTypes,
} from "../structures/index.ts";

export type InstaloaderError = ContextError | AbortDownloadError;
type FileError = PlatformError.PlatformError;

export const PlatformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer);

export const downloadFileEffect = (
  context: InstaloaderContextShape,
  url: string,
  targetPath: string,
  mtime?: Date
): Effect.Effect<boolean, InstaloaderError | FileError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fsService = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;

    const exists = yield* fsService.exists(targetPath);
    if (exists) {
      yield* context.log(`${targetPath} exists`);
      return false;
    }

    const resp = yield* context.getRaw(url);
    const buffer = yield* Effect.promise(() => resp.arrayBuffer());

    const dir = pathService.dirname(targetPath);
    const dirExists = yield* fsService.exists(dir);
    if (!dirExists) {
      yield* fsService.makeDirectory(dir, { recursive: true });
    }

    yield* fsService.writeFile(targetPath, new Uint8Array(buffer));

    if (mtime) {
      yield* pipe(
        fsService.utimes(targetPath, new Date(), mtime),
        Effect.catchAll(() => Effect.void)
      );
    }

    return true;
  });

// ============================================================================
// Download Configuration
// ============================================================================

export interface InstaloaderConfig {
  readonly dirnamePattern: string;
  readonly filenamePattern: string;
  readonly titlePattern: string;
  readonly sanitizePaths: boolean;
  readonly downloadPictures: boolean;
  readonly downloadVideos: boolean;
  readonly downloadVideoThumbnails: boolean;
  readonly downloadGeotags: boolean;
  readonly downloadComments: boolean;
  readonly saveMetadata: boolean;
  readonly compressJson: boolean;
  readonly postMetadataTxtPattern: string;
  readonly storyitemMetadataTxtPattern: string;
  readonly resumePrefix: string | null;
  readonly checkResumeBbd: boolean;
  readonly slideStart: number;
  readonly slideEnd: number;
}

export const defaultConfig: InstaloaderConfig = {
  dirnamePattern: "{target}",
  filenamePattern: "{date_utc}_UTC",
  titlePattern: "{date_utc}_UTC_{typename}",
  sanitizePaths: false,
  downloadPictures: true,
  downloadVideos: true,
  downloadVideoThumbnails: true,
  downloadGeotags: false,
  downloadComments: false,
  saveMetadata: true,
  compressJson: true,
  postMetadataTxtPattern: "{caption}",
  storyitemMetadataTxtPattern: "",
  resumePrefix: "iterator",
  checkResumeBbd: true,
  slideStart: 0,
  slideEnd: -1,
};

export function formatStringContainsKey(formatString: string, key: string): boolean {
  const pattern = new RegExp(`\\{${key}(?:\\.[^}]*)?\\}`, "g");
  return pattern.test(formatString);
}

export const sanitizePath = (str: string, forceWindows = false): string => {
  let result = str.replace(/\//g, "\u2215");

  if (result.startsWith(".")) {
    result = "\u2024" + result.slice(1);
  }

  if (forceWindows || process.platform === "win32") {
    result = result
      .replace(/:/g, "\uff1a")
      .replace(/</g, "\ufe64")
      .replace(/>/g, "\ufe65")
      .replace(/"/g, "\uff02")
      .replace(/\\/g, "\ufe68")
      .replace(/\|/g, "\uff5c")
      .replace(/\?/g, "\ufe16")
      .replace(/\*/g, "\uff0a")
      .replace(/\n/g, " ")
      .replace(/\r/g, " ");

    const reserved = new Set([
      "CON", "PRN", "AUX", "NUL",
      "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
      "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ]);

    const extIdx = result.lastIndexOf(".");
    let root = extIdx > 0 ? result.slice(0, extIdx) : result;
    let ext = extIdx > 0 ? result.slice(extIdx) : "";

    if (reserved.has(root.toUpperCase())) {
      root += "_";
    }
    if (ext === ".") {
      ext = "\u2024";
    }
    result = root + ext;
  }

  return result;
};

const formatDate = (date: Date): string => {
  return date.toISOString().replace(/[:.]/g, "-").slice(0, -5) + "_UTC";
};

const EPOCH_DATE = new Date(0);

export const formatPostFilename = (
  post: PostData,
  pattern: string,
  target?: string,
  forceWindows = false,
): string => {
  let result = pattern;
  const dateUtc = Option.getOrElse(postDateUtc(post), () => EPOCH_DATE);
  result = result
    .replace("{date_utc}", formatDate(dateUtc))
    .replace("{shortcode}", postShortcode(post))
    .replace("{mediaid}", String(postMediaid(post)))
    .replace("{typename}", postTypename(post));

  if (target) {
    result = result.replace("{target}", sanitizePath(target, forceWindows));
  }

  return result;
};

export const formatStoryItemFilename = (
  item: StoryItemData,
  pattern: string,
  target?: string,
  forceWindows = false,
): string => {
  let result = pattern;
  result = result
    .replace("{date_utc}", formatDate(storyItemDateUtc(item)))
    .replace("{mediaid}", String(storyItemMediaid(item)));

  if (target) {
    result = result.replace("{target}", sanitizePath(target, forceWindows));
  }

  return result;
};

export const formatDirname = (
  config: InstaloaderConfig,
  target: string,
  profile?: ProfileData
): string => {
  let result = config.dirnamePattern;
  const profileName = profile ? profileUsername(profile) : target;
  result = result
    .replace("{profile}", sanitizePath(profileName, config.sanitizePaths))
    .replace("{target}", sanitizePath(target, config.sanitizePaths));
  return result;
};

const prepareFilenameEffect = (
  filenameTemplate: string,
  url: string
): Effect.Effect<string, FileError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fsService = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;

    let filename = filenameTemplate;
    if (filename.includes("{filename}")) {
      const urlPath = new URL(url).pathname;
      const basename = pathService.basename(urlPath);
      const nameWithoutExt = basename.split(".")[0] ?? basename;
      filename = filename.replace("{filename}", nameWithoutExt);
    }
    const dir = pathService.dirname(filename);
    if (dir) {
      const dirExists = yield* fsService.exists(dir);
      if (!dirExists) {
        yield* fsService.makeDirectory(dir, { recursive: true });
      }
    }
    return filename;
  });

// ============================================================================
// Effect-based Download Functions
// ============================================================================

export const downloadPicEffect = (
  context: InstaloaderContextShape,
  filename: string,
  url: string,
  mtime: Date,
  filenameSuffix?: string,
): Effect.Effect<boolean, ContextError | FileError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fsService = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;

    let finalFilenameBase = filename;
    if (filenameSuffix) {
      finalFilenameBase = `${filename}_${filenameSuffix}`;
    }

    const urlMatch = url.match(/\.[a-z0-9]*\?/);
    const fileExtension = urlMatch ? urlMatch[0].slice(1, -1) : url.slice(-3);
    const nominalFilename = `${finalFilenameBase}.${fileExtension}`;

    const nominalExists = yield* fsService.exists(nominalFilename);
    if (nominalExists) {
      yield* context.log(`${nominalFilename} exists`);
      return false;
    }

    const resp = yield* context.getRaw(url);
    const contentType = resp.headers.get("Content-Type");
    let finalFilename: string;

    if (contentType) {
      let headerExt = "." + contentType.split(";")[0]!.split("/").pop()!.toLowerCase();
      headerExt = headerExt.replace("jpeg", "jpg");
      finalFilename = finalFilenameBase + headerExt;
    } else {
      finalFilename = nominalFilename;
    }

    if (finalFilename !== nominalFilename) {
      const finalExists = yield* fsService.exists(finalFilename);
      if (finalExists) {
        yield* context.log(`${finalFilename} exists`);
        return false;
      }
    }

    const buffer = yield* Effect.promise(() => resp.arrayBuffer());
    const dir = pathService.dirname(finalFilename);
    if (dir) {
      const dirExists = yield* fsService.exists(dir);
      if (!dirExists) {
        yield* fsService.makeDirectory(dir, { recursive: true });
      }
    }
    yield* fsService.writeFile(finalFilename, new Uint8Array(buffer));
    yield* pipe(
      fsService.utimes(finalFilename, new Date(), mtime),
      Effect.catchAll(() => Effect.void)
    );

    return true;
  });

const saveLocationEffect = (
  context: InstaloaderContextShape,
  filename: string,
  location: PostLocation,
  mtime: Date
): Effect.Effect<void, ContextError | FileError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fsService = yield* FileSystem.FileSystem;
    const locationFilename = `${filename}_location.txt`;
    let locationString: string;
    if (location.lat !== null && location.lng !== null) {
      locationString = `${location.name}\nhttps://maps.google.com/maps?q=${location.lat},${location.lng}&ll=${location.lat},${location.lng}\n`;
    } else {
      locationString = location.name;
    }
    yield* fsService.writeFileString(locationFilename, locationString);
    yield* pipe(
      fsService.utimes(locationFilename, new Date(), mtime),
      Effect.catchAll(() => Effect.void)
    );
    yield* context.log("geo");
  });

const saveMetadataJsonEffect = (
  context: InstaloaderContextShape,
  filename: string,
  data: JsonNode,
  compressJson: boolean
): Effect.Effect<void, ContextError | FileError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fsService = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    const jsonFilename = compressJson ? `${filename}.json.xz` : `${filename}.json`;
    const dir = pathService.dirname(jsonFilename);
    if (dir) {
      const dirExists = yield* fsService.exists(dir);
      if (!dirExists) {
        yield* fsService.makeDirectory(dir, { recursive: true });
      }
    }
    const jsonStr = JSON.stringify(data, null, compressJson ? undefined : 2);
    yield* fsService.writeFileString(jsonFilename, jsonStr);
    yield* context.log("json");
  });

export const downloadPostEffect = (
  context: InstaloaderContextShape,
  config: InstaloaderConfig,
  post: PostData,
  target: string
): Effect.Effect<boolean, ContextError | FileError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fsService = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;

    const dirname = formatDirname(config, target);
    const formattedFilename = formatPostFilename(post, config.filenamePattern, target, config.sanitizePaths);
    const filenameTemplate = pathService.join(dirname, formattedFilename);
    const filename = yield* prepareFilenameEffect(filenameTemplate, postUrl(post));
    const mtime = Option.getOrElse(postDateLocal(post), () => EPOCH_DATE);

    let downloaded = true;
    const typenameVal = postTypename(post);

    if (typenameVal === "GraphSidecar") {
      if ((config.downloadPictures || config.downloadVideos) && postMediacount(post) > 0) {
        let edgeNumber = config.slideStart % postMediacount(post);
        const sidecarNodes = yield* postGetSidecarNodes(context, post, config.slideStart, config.slideEnd);
        for (const sidecarNode of sidecarNodes) {
          edgeNumber++;
          const suffix = String(edgeNumber);

          if (config.downloadPictures && (!sidecarNode.videoUrl || config.downloadVideoThumbnails)) {
            const sidecarFilename = yield* prepareFilenameEffect(filenameTemplate, sidecarNode.displayUrl);
            const picDownloaded = yield* downloadPicEffect(
              context,
              sidecarFilename,
              sidecarNode.displayUrl,
              mtime,
              suffix,
            );
            downloaded = downloaded && picDownloaded;
          }

          if (sidecarNode.videoUrl && config.downloadVideos) {
            const sidecarFilename = yield* prepareFilenameEffect(filenameTemplate, sidecarNode.videoUrl);
            const vidDownloaded = yield* downloadPicEffect(
              context,
              sidecarFilename,
              sidecarNode.videoUrl,
              mtime,
              suffix,
            );
            downloaded = downloaded && vidDownloaded;
          }
        }
      }
    } else if (typenameVal === "GraphImage") {
      if (config.downloadPictures) {
        const jpgExists = yield* fsService.exists(`${filename}.jpg`);
        if (!jpgExists) {
          downloaded = yield* downloadPicEffect(context, filename, postUrl(post), mtime);
        } else {
          yield* context.log(`${filename}.jpg exists`);
          downloaded = false;
        }
      }
    } else if (typenameVal === "GraphVideo") {
      if (config.downloadPictures && config.downloadVideoThumbnails) {
        const jpgExists = yield* fsService.exists(`${filename}.jpg`);
        if (!jpgExists) {
          downloaded = yield* downloadPicEffect(context, filename, postUrl(post), mtime);
        } else {
          yield* context.log(`${filename}.jpg exists`);
          downloaded = false;
        }
      }
    }

    if (postIsVideo(post) && config.downloadVideos) {
      const videoUrl = yield* postGetVideoUrl(context, post);
      if (videoUrl) {
        const mp4Exists = yield* fsService.exists(`${filename}.mp4`);
        if (!mp4Exists) {
          const vidDownloaded = yield* downloadPicEffect(context, filename, videoUrl, mtime);
          downloaded = downloaded && vidDownloaded;
        }
      }
    }

    if (config.downloadGeotags) {
      const location = yield* postGetLocation(context, post);
      if (location) {
        yield* saveLocationEffect(context, filename, location, mtime);
      }
    }

    if (config.saveMetadata) {
      yield* saveMetadataJsonEffect(context, filename, postToDict(post), config.compressJson);
    }

    yield* context.log("");
    return downloaded;
  });

export const downloadStoryItemEffect = (
  context: InstaloaderContextShape,
  config: InstaloaderConfig,
  item: StoryItemData,
  target: string
): Effect.Effect<boolean, ContextError | FileError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fsService = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;

    const dirname = formatDirname(config, target);
    const formattedFilename = formatStoryItemFilename(item, config.filenamePattern, target, config.sanitizePaths);
    const filenameTemplate = pathService.join(dirname, formattedFilename);
    const imageUrl = yield* storyItemGetUrl(context, item);
    const filename = yield* prepareFilenameEffect(filenameTemplate, imageUrl);

    let downloaded = false;

    if (storyItemIsVideo(item) && config.downloadVideos) {
      const videoUrl = yield* storyItemGetVideoUrl(context, item);
      if (videoUrl) {
        const videoFilename = yield* prepareFilenameEffect(filenameTemplate, videoUrl);
        const mp4Exists = yield* fsService.exists(`${videoFilename}.mp4`);
        if (!mp4Exists) {
          downloaded = yield* downloadPicEffect(context, videoFilename, videoUrl, storyItemDateLocal(item));
        }
      }
    }

    if (!storyItemIsVideo(item) || config.downloadVideoThumbnails) {
      const jpgExists = yield* fsService.exists(`${filename}.jpg`);
      if (!jpgExists) {
        downloaded = yield* downloadPicEffect(context, filename, imageUrl, storyItemDateLocal(item));
      }
    }

    if (config.saveMetadata) {
      yield* saveMetadataJsonEffect(context, filename, storyItemToDict(item), config.compressJson);
    }

    yield* context.log("");
    return downloaded;
  });

export const getStoriesEffect = (
  context: InstaloaderContextShape,
  userids?: number[]
): Effect.Effect<StoryData[], ContextError | LoginRequiredError> =>
  Effect.gen(function* () {
    const loggedIn = yield* context.isLoggedIn;
    if (!loggedIn) {
      return yield* Effect.fail(new LoginRequiredError({ message: "Login required." }));
    }

    let resolvedUserids = userids;
    if (!resolvedUserids) {
      const data = yield* context.graphqlQuery(
        "d15efd8c0c5b23f0ef71f18bf363c704",
        { only_stories: true },
      );
      const userData = (data["data"] as JsonNode)["user"] as JsonNode | null;
      if (!userData) {
        return yield* Effect.fail(new BadResponseError({ message: "Bad stories reel JSON." }));
      }
      const feedReelsTray = userData["feed_reels_tray"] as JsonNode;
      const edges = (feedReelsTray["edge_reels_tray_to_reel"] as JsonNode)["edges"] as JsonNode[];
      resolvedUserids = edges.map((edge) => Number((edge["node"] as JsonNode)["id"]));
    }

    const stories: StoryData[] = [];
    const chunkSize = 50;
    for (let i = 0; i < resolvedUserids.length; i += chunkSize) {
      const chunk = resolvedUserids.slice(i, i + chunkSize);
      const storiesData = yield* context.graphqlQuery(
        "303a4ae99711322310f25250d988f3b7",
        { reel_ids: chunk, precomposed_overlay: false },
      );
      const reelsMedia = (storiesData["data"] as JsonNode)["reels_media"] as JsonNode[];
      for (const media of reelsMedia) {
        stories.push(storyFromNode(media));
      }
    }

    return stories;
  });

export const getHighlightsEffect = (
  context: InstaloaderContextShape,
  user: number | ProfileData
): Effect.Effect<HighlightData[], ContextError | LoginRequiredError> =>
  Effect.gen(function* () {
    const loggedIn = yield* context.isLoggedIn;
    if (!loggedIn) {
      return yield* Effect.fail(new LoginRequiredError({ message: "Login required." }));
    }

    const userid = typeof user === "number" ? user : profileUserid(user);
    const data = yield* context.graphqlQuery(
      "7c16654f22c819fb63d1183034a5162f",
      {
        user_id: userid,
        include_chaining: false,
        include_reel: false,
        include_suggested_users: false,
        include_logged_out_extras: false,
        include_highlight_reels: true,
      },
    );

    const userData = (data["data"] as JsonNode)["user"] as JsonNode;
    const highlightReels = userData["edge_highlight_reels"] as JsonNode | null;
    if (!highlightReels) {
      return yield* Effect.fail(new BadResponseError({ message: "Bad highlights reel JSON." }));
    }

    const edges = highlightReels["edges"] as JsonNode[];
    const ownerProfile = typeof user === "number" ? undefined : user;

    const highlights: HighlightData[] = [];
    for (const edge of edges) {
      highlights.push(highlightFromNode(edge["node"] as JsonNode, ownerProfile));
    }

    return highlights;
  });

export const getFeedPostsEffect = (
  context: InstaloaderContextShape
): Effect.Effect<Stream.Stream<PostData, ContextError>, ContextError | LoginRequiredError> =>
  Effect.gen(function* () {
    const loggedIn = yield* context.isLoggedIn;
    if (!loggedIn) {
      return yield* Effect.fail(new LoginRequiredError({ message: "Login required." }));
    }

    return Stream.unfoldEffect(
      { cursor: null as string | null, done: false },
      (state): Effect.Effect<Option.Option<readonly [PostData[], { cursor: string | null; done: boolean }]>, ContextError> => {
        if (state.done) {
          return Effect.succeed(Option.none());
        }

        return Effect.gen(function* () {
          const params = state.cursor ? {
            fetch_media_item_count: 12,
            fetch_media_item_cursor: state.cursor,
            fetch_comment_count: 4,
            fetch_like: 10,
            has_stories: false,
          } : {};

          const data = yield* context.graphqlQuery("d6f4427fbe92d846298cf93df0b937d3", params);

          const dataNode = data["data"] as JsonNode | null;
          if (!dataNode) return Option.none();

          const userData = dataNode["user"] as JsonNode | null;
          if (!userData) return Option.none();

          const feed = userData["edge_web_feed_timeline"] as JsonNode | null;
          if (!feed) return Option.none();

          const edges = feed["edges"] as JsonNode[] | null;
          if (!edges || edges.length === 0) return Option.none();

          const posts: PostData[] = [];
          for (const edge of edges) {
            const node = edge["node"] as JsonNode;
            const typename = node["__typename"] as string | undefined;
            const shortcodeVal = node["shortcode"] as string | undefined;

            if (
              typename &&
              postSupportedGraphqlTypes().includes(typename) &&
              shortcodeVal
            ) {
              const postResult = yield* Effect.either(postFromNode(node));
              if (postResult._tag === "Right") {
                posts.push(postResult.right);
              }
            }
          }

          const pageInfo = feed["page_info"] as JsonNode | null;
          const hasNextPage = pageInfo && pageInfo["has_next_page"];
          const nextCursor = hasNextPage ? (pageInfo["end_cursor"] as string) : null;

          if (posts.length === 0) return Option.none();

          return Option.some([
            posts,
            { cursor: nextCursor, done: !hasNextPage }
          ] as const);
        });
      }
    ).pipe(Stream.flatMap((posts) => Stream.fromIterable(posts)));
  });

// ============================================================================
// Instaloader Options
// ============================================================================

export interface InstaloaderOptions extends InstaloaderContextOptions {
  dirnamePattern?: string;
  filenamePattern?: string;
  titlePattern?: string;
  downloadPictures?: boolean;
  downloadVideos?: boolean;
  downloadVideoThumbnails?: boolean;
  downloadGeotags?: boolean;
  downloadComments?: boolean;
  saveMetadata?: boolean;
  compressJson?: boolean;
  postMetadataTxtPattern?: string;
  storyitemMetadataTxtPattern?: string;
  resumePrefix?: string | null;
  checkResumeBbd?: boolean;
  slide?: string;
  sanitizePaths?: boolean;
}

