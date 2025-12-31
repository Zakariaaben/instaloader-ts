import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  InstaloaderContext,
  type InstaloaderContextOptions,
} from "./context.ts";
import {
  BadResponseException,
  InvalidArgumentException,
  LoginRequiredException,
  PrivateProfileNotFollowedException,
} from "../exceptions/index.ts";
import {
  type JsonNode,
  Post,
  Profile,
  Story,
  StoryItem,
  Highlight,
  Hashtag,
  type PostLocation,
} from "../structures/index.ts";

function getConfigDir(): string {
  if (process.platform === "win32") {
    const localAppData = process.env["LOCALAPPDATA"];
    if (localAppData) {
      return path.join(localAppData, "Instaloader");
    }
    return path.join(os.tmpdir(), `.instaloader-${os.userInfo().username}`);
  }
  const xdgConfig = process.env["XDG_CONFIG_HOME"] ?? path.join(os.homedir(), ".config");
  return path.join(xdgConfig, "instaloader");
}

export function getDefaultSessionFilename(username: string): string {
  const configDir = getConfigDir();
  return path.join(configDir, `session-${username}`);
}

export function formatStringContainsKey(formatString: string, key: string): boolean {
  const pattern = new RegExp(`\\{${key}(?:\\.[^}]*)?\\}`, "g");
  return pattern.test(formatString);
}

function sanitizePath(str: string, forceWindows = false): string {
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
}

function formatFilename(
  item: Post | StoryItem,
  pattern: string,
  target?: string,
  forceWindows = false,
): string {
  let result = pattern;

  const formatDate = (date: Date): string => {
    return date.toISOString().replace(/[:.]/g, "-").slice(0, -5) + "_UTC";
  };

  if ("shortcode" in item) {
    const post = item as Post;
    result = result
      .replace("{date_utc}", formatDate(post.dateUtc))
      .replace("{shortcode}", post.shortcode)
      .replace("{mediaid}", String(post.mediaid))
      .replace("{typename}", post.typename);
  } else {
    const storyItem = item as StoryItem;
    result = result
      .replace("{date_utc}", formatDate(storyItem.dateUtc))
      .replace("{mediaid}", String(storyItem.mediaid));
  }

  if (target) {
    result = result.replace("{target}", sanitizePath(target, forceWindows));
  }

  return result;
}

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

export class Instaloader {
  context: InstaloaderContext;

  dirnamePattern: string;
  filenamePattern: string;
  titlePattern: string;
  sanitizePaths: boolean;
  downloadPictures: boolean;
  downloadVideos: boolean;
  downloadVideoThumbnails: boolean;
  downloadGeotags: boolean;
  downloadComments: boolean;
  saveMetadata: boolean;
  compressJson: boolean;
  postMetadataTxtPattern: string;
  storyitemMetadataTxtPattern: string;
  resumePrefix: string | null;
  checkResumeBbd: boolean;

  slideStart: number = 0;
  slideEnd: number = -1;

  constructor(options: InstaloaderOptions = {}) {
    this.context = new InstaloaderContext({
      sleep: options.sleep,
      quiet: options.quiet,
      userAgent: options.userAgent,
      maxConnectionAttempts: options.maxConnectionAttempts,
      requestTimeout: options.requestTimeout,
      rateController: options.rateController,
      fatalStatusCodes: options.fatalStatusCodes,
      iphoneSupport: options.iphoneSupport,
    });

    this.dirnamePattern = options.dirnamePattern ?? "{target}";
    this.filenamePattern = options.filenamePattern ?? "{date_utc}_UTC";

    if (options.titlePattern !== undefined) {
      this.titlePattern = options.titlePattern;
    } else {
      if (
        formatStringContainsKey(this.dirnamePattern, "profile") ||
        formatStringContainsKey(this.dirnamePattern, "target")
      ) {
        this.titlePattern = "{date_utc}_UTC_{typename}";
      } else {
        this.titlePattern = "{target}_{date_utc}_UTC_{typename}";
      }
    }

    this.sanitizePaths = options.sanitizePaths ?? false;
    this.downloadPictures = options.downloadPictures ?? true;
    this.downloadVideos = options.downloadVideos ?? true;
    this.downloadVideoThumbnails = options.downloadVideoThumbnails ?? true;
    this.downloadGeotags = options.downloadGeotags ?? false;
    this.downloadComments = options.downloadComments ?? false;
    this.saveMetadata = options.saveMetadata ?? true;
    this.compressJson = options.compressJson ?? true;
    this.postMetadataTxtPattern = options.postMetadataTxtPattern ?? "{caption}";
    this.storyitemMetadataTxtPattern = options.storyitemMetadataTxtPattern ?? "";
    this.resumePrefix = options.resumePrefix ?? "iterator";
    this.checkResumeBbd = options.checkResumeBbd ?? true;

    if (options.slide) {
      this._parseSlide(options.slide);
    }
  }

  private _parseSlide(slide: string): void {
    const parts = slide.split("-");
    if (parts.length === 1) {
      if (parts[0] === "last") {
        this.slideStart = -1;
      } else {
        const num = parseInt(parts[0]!, 10);
        if (num > 0) {
          this.slideStart = num - 1;
          this.slideEnd = num - 1;
        } else {
          throw new InvalidArgumentException("--slide parameter must be greater than 0.");
        }
      }
    } else if (parts.length === 2) {
      if (parts[1] === "last") {
        this.slideStart = parseInt(parts[0]!, 10) - 1;
      } else {
        const start = parseInt(parts[0]!, 10);
        const end = parseInt(parts[1]!, 10);
        if (0 < start && start < end) {
          this.slideStart = start - 1;
          this.slideEnd = end - 1;
        } else {
          throw new InvalidArgumentException("Invalid data for --slide parameter.");
        }
      }
    } else {
      throw new InvalidArgumentException("Invalid data for --slide parameter.");
    }
  }

  close(): void {
    this.context.close();
  }

  async login(user: string, passwd: string): Promise<void> {
    await this.context.login(user, passwd);
  }

  async twoFactorLogin(code: string): Promise<void> {
    await this.context.twoFactorLogin(code);
  }

  async testLogin(): Promise<string | null> {
    return await this.context.testLogin();
  }

  saveSession(): Record<string, string> {
    if (!this.context.isLoggedIn) {
      throw new LoginRequiredException("Login required.");
    }
    return this.context.saveSession();
  }

  loadSession(username: string, sessionData: Record<string, string>): void {
    this.context.loadSession(username, sessionData);
  }

  async saveSessionToFile(filename?: string): Promise<void> {
    if (!this.context.isLoggedIn) {
      throw new LoginRequiredException("Login required.");
    }
    const targetFilename = filename ?? getDefaultSessionFilename(this.context.username!);
    const dirname = path.dirname(targetFilename);
    if (dirname && !fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true, mode: 0o700 });
    }
    const sessionData = this.context.saveSession();
    fs.writeFileSync(targetFilename, JSON.stringify(sessionData), "utf-8");
    this.context.log(`Saved session to ${targetFilename}.`);
  }

  async loadSessionFromFile(username: string, filename?: string): Promise<void> {
    const targetFilename = filename ?? getDefaultSessionFilename(username);
    const data = fs.readFileSync(targetFilename, "utf-8");
    const sessionData = JSON.parse(data) as Record<string, string>;
    this.context.loadSession(username, sessionData);
    this.context.log(`Loaded session from ${targetFilename}.`);
  }

  private _requiresLogin(): void {
    if (!this.context.isLoggedIn) {
      throw new LoginRequiredException("Login required.");
    }
  }

  private async _downloadPic(
    filename: string,
    url: string,
    mtime: Date,
    filenameSuffix?: string,
  ): Promise<boolean> {
    if (filenameSuffix) {
      filename = `${filename}_${filenameSuffix}`;
    }

    const urlMatch = url.match(/\.[a-z0-9]*\?/);
    const fileExtension = urlMatch ? urlMatch[0].slice(1, -1) : url.slice(-3);
    const nominalFilename = `${filename}.${fileExtension}`;

    if (fs.existsSync(nominalFilename)) {
      this.context.log(`${nominalFilename} exists`, false);
      return false;
    }

    const resp = await this.context.getRaw(url);
    const contentType = resp.headers.get("Content-Type");
    let finalFilename: string;

    if (contentType) {
      let headerExt = "." + contentType.split(";")[0]!.split("/").pop()!.toLowerCase();
      headerExt = headerExt.replace("jpeg", "jpg");
      finalFilename = filename + headerExt;
    } else {
      finalFilename = nominalFilename;
    }

    if (finalFilename !== nominalFilename && fs.existsSync(finalFilename)) {
      this.context.log(`${finalFilename} exists`, false);
      return false;
    }

    const buffer = await resp.arrayBuffer();
    const dir = path.dirname(finalFilename);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(finalFilename, Buffer.from(buffer));
    fs.utimesSync(finalFilename, new Date(), mtime);

    return true;
  }

  private _formatDirname(target: string, profile?: Profile): string {
    let result = this.dirnamePattern;
    const profileName = profile?.username.toLowerCase() ?? target;
    result = result
      .replace("{profile}", sanitizePath(profileName, this.sanitizePaths))
      .replace("{target}", sanitizePath(target, this.sanitizePaths));
    return result;
  }

  private _prepareFilename(filenameTemplate: string, url: string): string {
    let filename = filenameTemplate;
    if (filename.includes("{filename}")) {
      const urlPath = new URL(url).pathname;
      const basename = path.basename(urlPath);
      const nameWithoutExt = basename.split(".")[0] ?? basename;
      filename = filename.replace("{filename}", nameWithoutExt);
    }
    const dir = path.dirname(filename);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return filename;
  }

  async downloadPost(post: Post, target: string): Promise<boolean> {
    const dirname = this._formatDirname(target);
    const formattedFilename = formatFilename(post, this.filenamePattern, target, this.sanitizePaths);
    const filenameTemplate = path.join(dirname, formattedFilename);
    const filename = this._prepareFilename(filenameTemplate, post.url);

    let downloaded = true;

    if (post.typename === "GraphSidecar") {
      if ((this.downloadPictures || this.downloadVideos) && post.mediacount > 0) {
        let edgeNumber = this.slideStart % post.mediacount;
        const sidecarNodes = await post.getSidecarNodes(this.slideStart, this.slideEnd);
        for (const sidecarNode of sidecarNodes) {
          edgeNumber++;
          const suffix = String(edgeNumber);

          if (this.downloadPictures && (!sidecarNode.videoUrl || this.downloadVideoThumbnails)) {
            const sidecarFilename = this._prepareFilename(filenameTemplate, sidecarNode.displayUrl);
            downloaded = downloaded && await this._downloadPic(
              sidecarFilename,
              sidecarNode.displayUrl,
              post.dateLocal,
              suffix,
            );
          }

          if (sidecarNode.videoUrl && this.downloadVideos) {
            const sidecarFilename = this._prepareFilename(filenameTemplate, sidecarNode.videoUrl);
            downloaded = downloaded && await this._downloadPic(
              sidecarFilename,
              sidecarNode.videoUrl,
              post.dateLocal,
              suffix,
            );
          }
        }
      }
    } else if (post.typename === "GraphImage") {
      if (this.downloadPictures) {
        if (!fs.existsSync(`${filename}.jpg`)) {
          downloaded = await this._downloadPic(filename, post.url, post.dateLocal);
        } else {
          this.context.log(`${filename}.jpg exists`, false);
          downloaded = false;
        }
      }
    } else if (post.typename === "GraphVideo") {
      if (this.downloadPictures && this.downloadVideoThumbnails) {
        if (!fs.existsSync(`${filename}.jpg`)) {
          downloaded = await this._downloadPic(filename, post.url, post.dateLocal);
        } else {
          this.context.log(`${filename}.jpg exists`, false);
          downloaded = false;
        }
      }
    }

    if (post.isVideo && this.downloadVideos) {
      const videoUrl = await post.getVideoUrl();
      if (videoUrl && !fs.existsSync(`${filename}.mp4`)) {
        downloaded = downloaded && await this._downloadPic(filename, videoUrl, post.dateLocal);
      }
    }

    if (this.downloadGeotags) {
      const location = await post.getLocation();
      if (location) {
        this._saveLocation(filename, location, post.dateLocal);
      }
    }

    if (this.saveMetadata) {
      this._saveMetadataJson(filename, post._asdict());
    }

    this.context.log("");
    return downloaded;
  }

  private _saveLocation(filename: string, location: PostLocation, mtime: Date): void {
    const locationFilename = `${filename}_location.txt`;
    let locationString: string;
    if (location.lat !== null && location.lng !== null) {
      locationString = `${location.name}\nhttps://maps.google.com/maps?q=${location.lat},${location.lng}&ll=${location.lat},${location.lng}\n`;
    } else {
      locationString = location.name;
    }
    fs.writeFileSync(locationFilename, locationString, "utf-8");
    fs.utimesSync(locationFilename, new Date(), mtime);
    this.context.log("geo", false);
  }

  private _saveMetadataJson(filename: string, data: JsonNode): void {
    const jsonFilename = this.compressJson ? `${filename}.json.xz` : `${filename}.json`;
    const dir = path.dirname(jsonFilename);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const jsonStr = JSON.stringify(data, null, this.compressJson ? undefined : 2);
    fs.writeFileSync(jsonFilename, jsonStr, "utf-8");
    this.context.log("json", false);
  }

  async downloadStoryItem(item: StoryItem, target: string): Promise<boolean> {
    const dirname = this._formatDirname(target);
    const formattedFilename = formatFilename(item, this.filenamePattern, target, this.sanitizePaths);
    const filenameTemplate = path.join(dirname, formattedFilename);
    const filename = this._prepareFilename(filenameTemplate, item.url);

    let downloaded = false;

    if (item.isVideo && this.downloadVideos) {
      const videoUrl = await item.getVideoUrl();
      if (videoUrl) {
        const videoFilename = this._prepareFilename(filenameTemplate, videoUrl);
        if (!fs.existsSync(`${videoFilename}.mp4`)) {
          downloaded = await this._downloadPic(videoFilename, videoUrl, item.dateLocal);
        }
      }
    }

    if (!item.isVideo || this.downloadVideoThumbnails) {
      const imageUrl = await item.getUrl();
      if (!fs.existsSync(`${filename}.jpg`)) {
        downloaded = await this._downloadPic(filename, imageUrl, item.dateLocal);
      }
    }

    if (this.saveMetadata) {
      this._saveMetadataJson(filename, item._asdict());
    }

    this.context.log("");
    return downloaded;
  }

  async *getStories(userids?: number[]): AsyncGenerator<Story> {
    this._requiresLogin();

    if (!userids) {
      const data = await this.context.graphqlQuery(
        "d15efd8c0c5b23f0ef71f18bf363c704",
        { only_stories: true },
      );
      const userData = (data["data"] as JsonNode)["user"] as JsonNode | null;
      if (!userData) {
        throw new BadResponseException("Bad stories reel JSON.");
      }
      const feedReelsTray = userData["feed_reels_tray"] as JsonNode;
      const edges = (feedReelsTray["edge_reels_tray_to_reel"] as JsonNode)["edges"] as JsonNode[];
      userids = edges.map((edge) => Number((edge["node"] as JsonNode)["id"]));
    }

    const chunkSize = 50;
    for (let i = 0; i < userids.length; i += chunkSize) {
      const chunk = userids.slice(i, i + chunkSize);
      const storiesData = await this.context.graphqlQuery(
        "303a4ae99711322310f25250d988f3b7",
        { reel_ids: chunk, precomposed_overlay: false },
      );
      const reelsMedia = (storiesData["data"] as JsonNode)["reels_media"] as JsonNode[];
      for (const media of reelsMedia) {
        yield new Story(this.context, media);
      }
    }
  }

  async downloadStories(
    userids?: number[],
    options: {
      fastUpdate?: boolean;
      filenameTarget?: string;
      storyitemFilter?: (item: StoryItem) => boolean;
    } = {},
  ): Promise<void> {
    this._requiresLogin();

    const { fastUpdate = false, filenameTarget = ":stories", storyitemFilter } = options;

    if (!userids) {
      this.context.log("Retrieving all visible stories...");
    }

    let i = 0;
    for await (const userStory of this.getStories(userids)) {
      i++;
      const name = userStory.ownerUsername;
      this.context.log(`[${i}] Retrieving stories from profile ${name}.`);

      const totalCount = userStory.itemcount;
      let count = 1;

      for await (const item of userStory.getItems()) {
        if (storyitemFilter && !storyitemFilter(item)) {
          this.context.log(`<${item} skipped>`);
          continue;
        }

        this.context.log(`[${count}/${totalCount}] `, false);
        count++;

        const downloaded = await this.downloadStoryItem(item, filenameTarget ?? name);
        if (fastUpdate && !downloaded) {
          break;
        }
      }
    }
  }

  async *getHighlights(user: number | Profile): AsyncGenerator<Highlight> {
    this._requiresLogin();

    const userid = typeof user === "number" ? user : user.userid;
    const data = await this.context.graphqlQuery(
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
      throw new BadResponseException("Bad highlights reel JSON.");
    }

    const edges = highlightReels["edges"] as JsonNode[];
    const ownerProfile = typeof user === "number" ? undefined : user;

    for (const edge of edges) {
      yield new Highlight(this.context, edge["node"] as JsonNode, ownerProfile);
    }
  }

  async downloadHighlights(
    user: number | Profile,
    options: {
      fastUpdate?: boolean;
      filenameTarget?: string;
      storyitemFilter?: (item: StoryItem) => boolean;
    } = {},
  ): Promise<void> {
    this._requiresLogin();

    const { fastUpdate = false, filenameTarget, storyitemFilter } = options;

    for await (const highlight of this.getHighlights(user)) {
      const name = highlight.ownerUsername;
      const target = filenameTarget ?? path.join(
        sanitizePath(name, this.sanitizePaths),
        sanitizePath(highlight.title, this.sanitizePaths),
      );

      this.context.log(`Retrieving highlights "${highlight.title}" from profile ${name}`);

      const totalCount = await highlight.getItemcount();
      let count = 1;

      for await (const item of highlight.getItems()) {
        if (storyitemFilter && !storyitemFilter(item)) {
          this.context.log(`<${item} skipped>`);
          continue;
        }

        this.context.log(`[${count}/${totalCount}] `, false);
        count++;

        const downloaded = await this.downloadStoryItem(item, target);
        if (fastUpdate && !downloaded) {
          break;
        }
      }
    }
  }

  async *getFeedPosts(): AsyncGenerator<Post> {
    this._requiresLogin();

    let data = await this.context.graphqlQuery("d6f4427fbe92d846298cf93df0b937d3", {});

    while (true) {
      const dataNode = data["data"] as JsonNode | null;
      if (!dataNode) {
        break;
      }
      const userData = dataNode["user"] as JsonNode | null;
      if (!userData) {
        break;
      }
      const feed = userData["edge_web_feed_timeline"] as JsonNode | null;
      if (!feed) {
        break;
      }
      const edges = feed["edges"] as JsonNode[] | null;
      if (!edges) {
        break;
      }

      for (const edge of edges) {
        const node = edge["node"] as JsonNode;
        const typename = node["__typename"] as string | undefined;
        const shortcode = node["shortcode"] as string | undefined;

        if (
          typename &&
          Post.supportedGraphqlTypes().includes(typename) &&
          shortcode
        ) {
          yield new Post(this.context, node);
        }
      }

      const pageInfo = feed["page_info"] as JsonNode | null;
      if (!pageInfo || !pageInfo["has_next_page"]) {
        break;
      }

      data = await this.context.graphqlQuery("d6f4427fbe92d846298cf93df0b937d3", {
        fetch_media_item_count: 12,
        fetch_media_item_cursor: pageInfo["end_cursor"],
        fetch_comment_count: 4,
        fetch_like: 10,
        has_stories: false,
      });
    }
  }

  async downloadFeedPosts(options: {
    maxCount?: number;
    fastUpdate?: boolean;
    postFilter?: (post: Post) => boolean;
  } = {}): Promise<void> {
    this._requiresLogin();

    const { maxCount, fastUpdate = false, postFilter } = options;

    this.context.log("Retrieving pictures from your feed...");

    let count = 0;
    for await (const post of this.getFeedPosts()) {
      count++;
      if (maxCount !== undefined && count > maxCount) {
        break;
      }

      this.context.log(`[${count}] `, false);

      if (postFilter && !postFilter(post)) {
        this.context.log(`${post} skipped`);
        continue;
      }

      const downloaded = await this.downloadPost(post, ":feed");
      if (fastUpdate && !downloaded) {
        break;
      }
    }
  }

  async downloadProfile(
    profileName: string | Profile,
    options: {
      profilePic?: boolean;
      posts?: boolean;
      stories?: boolean;
      highlights?: boolean;
      tagged?: boolean;
      igtv?: boolean;
      reels?: boolean;
      fastUpdate?: boolean;
      maxCount?: number;
      postFilter?: (post: Post) => boolean;
      storyitemFilter?: (item: StoryItem) => boolean;
    } = {},
  ): Promise<void> {
    const {
      profilePic = true,
      posts = true,
      stories = false,
      highlights = false,
      tagged: _tagged = false,
      igtv: _igtv = false,
      reels: _reels = false,
      fastUpdate = false,
      maxCount,
      postFilter,
      storyitemFilter,
    } = options;
    void _tagged;
    void _igtv;
    void _reels;

    let profile: Profile;
    if (typeof profileName === "string") {
      profile = await Profile.fromUsername(this.context, profileName);
    } else {
      profile = profileName;
    }

    const username = profile.username;

    if (profilePic) {
      this.context.log(`Downloading profile picture of ${username}`);
      const profilePicUrl = profile.profilePicUrl;
      await this._downloadPic(
        path.join(this._formatDirname(username, profile), `${username}_profile_pic`),
        profilePicUrl,
        new Date(),
      );
    }

    if (profile.isPrivate) {
      if (!this.context.isLoggedIn) {
        throw new LoginRequiredException(`Profile ${username} requires login`);
      }
      if (this.context.username !== username && !profile.followedByViewer) {
        throw new PrivateProfileNotFollowedException(
          `Profile ${username}: private but not followed.`,
        );
      }
    }

    if (stories) {
      this._requiresLogin();
      this.context.log(`Downloading stories of ${username}`);
      await this.downloadStories([profile.userid], {
        fastUpdate,
        filenameTarget: username,
        storyitemFilter,
      });
    }

    if (highlights) {
      this._requiresLogin();
      this.context.log(`Downloading highlights of ${username}`);
      await this.downloadHighlights(profile, { fastUpdate, storyitemFilter });
    }

    if (posts) {
      this.context.log(`Retrieving posts from profile ${username}.`);
      let count = 0;
      for await (const post of profile.getPosts()) {
        count++;
        if (maxCount !== undefined && count > maxCount) {
          break;
        }

        this.context.log(`[${count}/${profile.mediacount}] `, false);

        if (postFilter && !postFilter(post)) {
          this.context.log(`${post} skipped`);
          continue;
        }

        const downloaded = await this.downloadPost(post, username);
        if (fastUpdate && !downloaded) {
          break;
        }
      }
    }

    if (this.saveMetadata) {
      const jsonFilename = path.join(
        this._formatDirname(username, profile),
        `${username}_${profile.userid}`,
      );
      this._saveMetadataJson(jsonFilename, profile._asdict());
    }
  }

  async downloadHashtag(
    hashtag: string | Hashtag,
    options: {
      maxCount?: number;
      fastUpdate?: boolean;
      postFilter?: (post: Post) => boolean;
      profilePic?: boolean;
      posts?: boolean;
    } = {},
  ): Promise<void> {
    const {
      maxCount,
      fastUpdate = false,
      postFilter,
      profilePic = true,
      posts = true,
    } = options;

    let hashtagObj: Hashtag;
    if (typeof hashtag === "string") {
      hashtagObj = await Hashtag.fromName(this.context, hashtag);
    } else {
      hashtagObj = hashtag;
    }

    const target = `#${hashtagObj.name}`;

    if (profilePic) {
      const picUrl = await hashtagObj.getProfilePicUrl();
      await this._downloadPic(
        path.join(this._formatDirname(target), `${target}_profile_pic`),
        picUrl,
        new Date(),
      );
    }

    if (posts) {
      this.context.log(`Retrieving pictures with hashtag #${hashtagObj.name}...`);

      let count = 0;
      for await (const post of hashtagObj.getPosts()) {
        count++;
        if (maxCount !== undefined && count > maxCount) {
          break;
        }

        this.context.log(`[${count}] `, false);

        if (postFilter && !postFilter(post)) {
          this.context.log(`${post} skipped`);
          continue;
        }

        const downloaded = await this.downloadPost(post, target);
        if (fastUpdate && !downloaded) {
          break;
        }
      }
    }

    if (this.saveMetadata) {
      const jsonFilename = path.join(this._formatDirname(target), target);
      this._saveMetadataJson(jsonFilename, hashtagObj._asdict());
    }
  }

  get hasStoredErrors(): boolean {
    return this.context.hasStoredErrors;
  }
}
