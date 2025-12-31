import { InstaloaderContext } from "../core/context.ts";
import {
  BadResponseException,
  IPhoneSupportDisabledException,
  LoginRequiredException,
} from "../exceptions/index.ts";
import {
  HASHTAG_REGEX,
  MENTION_REGEX,
  optionalNormalize,
  type JsonNode,
} from "./common.ts";
import { Post } from "./post.ts";
import { Profile } from "./profile.ts";

export class StoryItem {
  private _context: InstaloaderContext;
  private _node: JsonNode;
  private _ownerProfile: Profile | null;
  private _iphoneStruct_: JsonNode | null = null;

  constructor(
    context: InstaloaderContext,
    node: JsonNode,
    ownerProfile?: Profile,
  ) {
    this._context = context;
    this._node = node;
    this._ownerProfile = ownerProfile ?? null;

    if ("iphone_struct" in node) {
      this._iphoneStruct_ = node["iphone_struct"] as JsonNode;
    }
  }

  _asdict(): JsonNode {
    const node = { ...this._node };
    if (this._ownerProfile) {
      node["owner"] = this._ownerProfile._asdict();
    }
    if (this._iphoneStruct_) {
      node["iphone_struct"] = this._iphoneStruct_;
    }
    return node;
  }

  get mediaid(): number {
    return Number(this._node["id"]);
  }

  get shortcode(): string {
    return Post.mediaidToShortcode(this.mediaid);
  }

  toString(): string {
    return `<StoryItem ${this.mediaid}>`;
  }

  equals(other: StoryItem): boolean {
    return this.mediaid === other.mediaid;
  }

  static async fromMediaid(
    context: InstaloaderContext,
    mediaid: number,
  ): Promise<StoryItem> {
    const picJson = await context.graphqlQuery(
      "2b0673e0dc4580674a88d426fe00ea90",
      { shortcode: Post.mediaidToShortcode(mediaid) },
    );
    const shortcodeMedia = (picJson["data"] as JsonNode)["shortcode_media"] as JsonNode | null;
    if (shortcodeMedia === null) {
      throw new BadResponseException("Fetching StoryItem metadata failed.");
    }
    return new StoryItem(context, shortcodeMedia);
  }

  async getIphoneStruct(): Promise<JsonNode> {
    if (!this._context.iphoneSupport) {
      throw new IPhoneSupportDisabledException("iPhone support is disabled.");
    }
    if (!this._context.isLoggedIn) {
      throw new LoginRequiredException(
        "Login required to access iPhone media info endpoint.",
      );
    }
    if (!this._iphoneStruct_) {
      const data = await this._context.getIphoneJson(
        `api/v1/feed/reels_media/?reel_ids=${this.ownerId}`,
        {},
      );
      this._iphoneStruct_ = {};
      const reels = data["reels"] as JsonNode;
      const ownerReel = reels[String(this.ownerId)] as JsonNode;
      const items = ownerReel["items"] as JsonNode[];
      for (const item of items) {
        if (Number(item["pk"]) === this.mediaid) {
          this._iphoneStruct_ = item;
          break;
        }
      }
    }
    return this._iphoneStruct_;
  }

  get ownerProfile(): Profile {
    if (!this._ownerProfile) {
      throw new Error(
        "Owner profile not loaded. Call getOwnerProfile() instead.",
      );
    }
    return this._ownerProfile;
  }

  async getOwnerProfile(): Promise<Profile> {
    if (!this._ownerProfile) {
      const owner = this._node["owner"] as JsonNode;
      this._ownerProfile = await Profile.fromId(
        this._context,
        Number(owner["id"]),
      );
    }
    return this._ownerProfile;
  }

  get ownerUsername(): string {
    return this.ownerProfile.username;
  }

  async getOwnerUsername(): Promise<string> {
    const profile = await this.getOwnerProfile();
    return profile.username;
  }

  get ownerId(): number {
    return this.ownerProfile.userid;
  }

  async getOwnerId(): Promise<number> {
    const profile = await this.getOwnerProfile();
    return profile.userid;
  }

  get dateLocal(): Date {
    const timestamp = this._node["taken_at_timestamp"] as number;
    return new Date(timestamp * 1000);
  }

  get dateUtc(): Date {
    const timestamp = this._node["taken_at_timestamp"] as number;
    return new Date(timestamp * 1000);
  }

  get date(): Date {
    return this.dateUtc;
  }

  get profile(): string {
    return this.ownerUsername;
  }

  get expiringLocal(): Date {
    const timestamp = this._node["expiring_at_timestamp"] as number;
    return new Date(timestamp * 1000);
  }

  get expiringUtc(): Date {
    const timestamp = this._node["expiring_at_timestamp"] as number;
    return new Date(timestamp * 1000);
  }

  get url(): string {
    const displayResources = this._node["display_resources"] as JsonNode[];
    const lastResource = displayResources[displayResources.length - 1];
    return lastResource ? (lastResource["src"] as string) : "";
  }

  async getUrl(): Promise<string> {
    const typename = this.typename;
    if (
      (typename === "GraphStoryImage" || typename === "StoryImage") &&
      this._context.iphoneSupport &&
      this._context.isLoggedIn
    ) {
      try {
        const iphoneStruct = await this.getIphoneStruct();
        const imageVersions = iphoneStruct["image_versions2"] as JsonNode | undefined;
        const candidates = imageVersions?.["candidates"] as JsonNode[] | undefined;
        const firstCandidate = candidates?.[0];
        if (firstCandidate) {
          const origUrl = firstCandidate["url"] as string;
          return origUrl.replace(/([?&])se=\d+&?/g, "$1").replace(/&$/, "");
        }
      } catch (err) {
        this._context.error(
          `Unable to fetch high quality image version of ${this}: ${err}`,
        );
      }
    }
    return this.url;
  }

  get typename(): string {
    return this._node["__typename"] as string;
  }

  get caption(): string | null {
    if ("edge_media_to_caption" in this._node) {
      const captionData = this._node["edge_media_to_caption"] as JsonNode;
      const edges = captionData["edges"] as JsonNode[];
      if (edges.length > 0) {
        const firstEdge = edges[0];
        if (firstEdge) {
          const text = (firstEdge["node"] as JsonNode)["text"] as string;
          return optionalNormalize(text);
        }
      }
    } else if ("caption" in this._node) {
      return optionalNormalize(this._node["caption"] as string | null);
    }
    return null;
  }

  get captionHashtags(): string[] {
    if (!this.caption) {
      return [];
    }
    const matches = this.caption.toLowerCase().matchAll(HASHTAG_REGEX);
    return Array.from(matches, (m) => m[1]).filter(
      (s): s is string => s !== undefined,
    );
  }

  get captionMentions(): string[] {
    if (!this.caption) {
      return [];
    }
    const matches = this.caption.toLowerCase().matchAll(MENTION_REGEX);
    return Array.from(matches, (m) => m[1]).filter(
      (s): s is string => s !== undefined,
    );
  }

  get pcaption(): string {
    if (!this.caption) {
      return "";
    }
    const pcaption = this.caption
      .split("\n")
      .filter((s) => s)
      .map((s) => s.replace("/", "\u2215"))
      .join(" ")
      .trim();
    return pcaption.length > 31 ? pcaption.slice(0, 30) + "\u2026" : pcaption;
  }

  get isVideo(): boolean {
    return this._node["is_video"] as boolean;
  }

  get videoUrl(): string | null {
    if (!this.isVideo) {
      return null;
    }
    const videoResources = this._node["video_resources"] as JsonNode[] | undefined;
    if (videoResources && videoResources.length > 0) {
      const lastResource = videoResources[videoResources.length - 1];
      return lastResource ? (lastResource["src"] as string) : null;
    }
    return null;
  }

  async getVideoUrl(): Promise<string | null> {
    if (!this.isVideo) {
      return null;
    }

    const versionUrls: string[] = [];

    const videoResources = this._node["video_resources"] as JsonNode[] | undefined;
    if (videoResources && videoResources.length > 0) {
      const lastResource = videoResources[videoResources.length - 1];
      if (lastResource) {
        versionUrls.push(lastResource["src"] as string);
      }
    }

    if (this._context.iphoneSupport && this._context.isLoggedIn) {
      try {
        const iphoneStruct = await this.getIphoneStruct();
        const videoVersions = iphoneStruct["video_versions"] as JsonNode[] | undefined;
        if (videoVersions) {
          for (const version of videoVersions) {
            versionUrls.push(version["url"] as string);
          }
        }
      } catch (err) {
        this._context.error(
          `Unable to fetch high-quality video version of ${this}: ${err}`,
        );
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
    for (let idx = 0; idx < uniqueUrls.length; idx++) {
      const url = uniqueUrls[idx];
      if (!url) continue;
      try {
        const response = await this._context.head(url, true);
        const contentLength = parseInt(
          response.headers.get("Content-Length") ?? "0",
          10,
        );
        candidates.push([contentLength, url]);
      } catch (err) {
        this._context.error(
          `Video URL candidate ${idx + 1}/${uniqueUrls.length} for ${this}: ${err}`,
        );
      }
    }

    if (candidates.length === 0) {
      return uniqueUrls[0] ?? null;
    }

    candidates.sort((a, b) => a[0] - b[0]);
    const lastCandidate = candidates[candidates.length - 1];
    return lastCandidate ? lastCandidate[1] : null;
  }
}

export class Story {
  protected _context: InstaloaderContext;
  protected _node: JsonNode;
  protected _uniqueId: string | null = null;
  protected _ownerProfile: Profile | null = null;
  protected _iphoneStruct_: JsonNode | null = null;

  constructor(context: InstaloaderContext, node: JsonNode) {
    this._context = context;
    this._node = node;
  }

  toString(): string {
    const date = this.latestMediaUtc;
    const formatted = date.toISOString().replace(/[:.]/g, "-").slice(0, -5);
    return `<Story by ${this.ownerUsername} changed ${formatted}_UTC>`;
  }

  equals(other: Story): boolean {
    return this.uniqueId === other.uniqueId;
  }

  get uniqueId(): string | number {
    if (!this._uniqueId) {
      const idList: number[] = [];
      for (const item of this.getItemsSync()) {
        idList.push(item.mediaid);
      }
      idList.sort((a, b) => a - b);
      this._uniqueId = String(this.ownerId) + idList.join("");
    }
    return this._uniqueId;
  }

  get lastSeenLocal(): Date | null {
    const seen = this._node["seen"] as number | null;
    if (seen) {
      return new Date(seen * 1000);
    }
    return null;
  }

  get lastSeenUtc(): Date | null {
    const seen = this._node["seen"] as number | null;
    if (seen) {
      return new Date(seen * 1000);
    }
    return null;
  }

  get latestMediaLocal(): Date {
    const timestamp = this._node["latest_reel_media"] as number;
    return new Date(timestamp * 1000);
  }

  get latestMediaUtc(): Date {
    const timestamp = this._node["latest_reel_media"] as number;
    return new Date(timestamp * 1000);
  }

  get itemcount(): number {
    const items = this._node["items"] as JsonNode[];
    return items.length;
  }

  get ownerProfile(): Profile {
    if (!this._ownerProfile) {
      const user = this._node["user"] as JsonNode;
      this._ownerProfile = new Profile(this._context, user);
    }
    return this._ownerProfile;
  }

  get ownerUsername(): string {
    return this.ownerProfile.username;
  }

  get ownerId(): number {
    return this.ownerProfile.userid;
  }

  protected async _fetchIphoneStruct(): Promise<void> {
    if (
      this._context.iphoneSupport &&
      this._context.isLoggedIn &&
      !this._iphoneStruct_
    ) {
      const data = await this._context.getIphoneJson(
        `api/v1/feed/reels_media/?reel_ids=${this.ownerId}`,
        {},
      );
      const reels = data["reels"] as JsonNode;
      this._iphoneStruct_ = reels[String(this.ownerId)] as JsonNode;
    }
  }

  private *getItemsSync(): Generator<StoryItem> {
    const items = this._node["items"] as JsonNode[];
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item) {
        yield new StoryItem(this._context, item, this.ownerProfile);
      }
    }
  }

  async *getItems(): AsyncGenerator<StoryItem> {
    await this._fetchIphoneStruct();
    const items = this._node["items"] as JsonNode[];

    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (!item) continue;

      if (this._iphoneStruct_) {
        const iphoneItems = this._iphoneStruct_["items"] as JsonNode[];
        for (const iphoneItem of iphoneItems) {
          if (Number(iphoneItem["pk"]) === Number(item["id"])) {
            item["iphone_struct"] = iphoneItem;
            break;
          }
        }
      }

      yield new StoryItem(this._context, item, this.ownerProfile);
    }
  }
}
