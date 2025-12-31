import { InstaloaderContext } from "../core/context.ts";
import {
  BadResponseException,
  IPhoneSupportDisabledException,
  InvalidArgumentException,
  LoginRequiredException,
  PostChangedException,
} from "../exceptions/index.ts";
import {
  HASHTAG_REGEX,
  MENTION_REGEX,
  optionalNormalize,
  type JsonNode,
  type PostLocation,
  type PostSidecarNode,
} from "./common.ts";
import { Profile } from "./profile.ts";

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

export class Post {
  private _context: InstaloaderContext;
  private _node: JsonNode;
  private _ownerProfile: Profile | null;
  private _fullMetadataDict: JsonNode | null = null;
  private _location: PostLocation | null = null;
  private _iphoneStruct_: JsonNode | null = null;

  constructor(
    context: InstaloaderContext,
    node: JsonNode,
    ownerProfile?: Profile,
  ) {
    if (!("shortcode" in node) && !("code" in node)) {
      throw new Error("Post node must contain 'shortcode' or 'code'");
    }

    this._context = context;
    this._node = node;
    this._ownerProfile = ownerProfile ?? null;

    if ("iphone_struct" in node) {
      this._iphoneStruct_ = node["iphone_struct"] as JsonNode;
    }
  }

  static async fromShortcode(
    context: InstaloaderContext,
    shortcode: string,
  ): Promise<Post> {
    const post = new Post(context, { shortcode });
    post._node = await post._getFullMetadata();
    return post;
  }

  static async fromMediaid(
    context: InstaloaderContext,
    mediaid: number,
  ): Promise<Post> {
    return Post.fromShortcode(context, Post.mediaidToShortcode(mediaid));
  }

  static fromIphoneStruct(
    context: InstaloaderContext,
    media: JsonNode,
  ): Post {
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
          node: Post._convertIphoneCarousel(node),
        })),
      };
    }

    const ownerProfile = "user" in media
      ? Profile.fromIphoneStruct(context, media["user"] as JsonNode)
      : undefined;

    return new Post(context, fakeNode, ownerProfile);
  }

  private static _convertIphoneCarousel(iphoneNode: JsonNode): JsonNode {
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
  }

  static shortcodeToMediaid(code: string): bigint {
    if (code.length > 11) {
      throw new InvalidArgumentException(
        `Wrong shortcode "${code}", unable to convert to mediaid.`,
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
  }

  static mediaidToShortcode(mediaid: bigint | number): string {
    let id = typeof mediaid === "bigint" ? mediaid : BigInt(mediaid);
    if (id < 0n || id >= 2n ** 64n) {
      throw new InvalidArgumentException(
        `Wrong mediaid ${mediaid}, unable to convert to shortcode`,
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
  }

  static supportedGraphqlTypes(): string[] {
    return ["GraphImage", "GraphVideo", "GraphSidecar"];
  }

  _asdict(): JsonNode {
    const node = { ...this._node };
    if (this._fullMetadataDict) {
      Object.assign(node, this._fullMetadataDict);
    }
    if (this._ownerProfile) {
      node["owner"] = this._ownerProfile._asdict();
    }
    if (this._location) {
      node["location"] = { ...this._location };
    }
    if (this._iphoneStruct_) {
      node["iphone_struct"] = this._iphoneStruct_;
    }
    return node;
  }

  get shortcode(): string {
    return (this._node["shortcode"] ?? this._node["code"]) as string;
  }

  get mediaid(): number {
    return Number(this._node["id"]);
  }

  get title(): string | null {
    try {
      return this._field<string>("title");
    } catch {
      return null;
    }
  }

  toString(): string {
    return `<Post ${this.shortcode}>`;
  }

  equals(other: Post): boolean {
    return this.shortcode === other.shortcode;
  }

  private async _obtainMetadata(): Promise<void> {
    if (!this._fullMetadataDict) {
      const picJson = await this._context.docIdGraphqlQuery(
        "8845758582119845",
        { shortcode: this.shortcode },
      );
      const data = (picJson["data"] as JsonNode)["xdt_shortcode_media"] as JsonNode | null;
      if (data === null) {
        throw new BadResponseException("Fetching Post metadata failed.");
      }
      const typename = data["__typename"] as string;
      if (typename in XDT_TYPES) {
        data["__typename"] = XDT_TYPES[typename];
      } else {
        throw new BadResponseException(
          `Unknown __typename in metadata: ${typename}.`,
        );
      }
      this._fullMetadataDict = data;
      if (this.shortcode !== this._fullMetadataDict["shortcode"]) {
        Object.assign(this._node, this._fullMetadataDict);
        throw new PostChangedException();
      }
    }
  }

  private async _getFullMetadata(): Promise<JsonNode> {
    await this._obtainMetadata();
    return this._fullMetadataDict!;
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
        `api/v1/media/${this.mediaid}/info/`,
        {},
      );
      const items = data["items"] as JsonNode[] | undefined;
      if (!items || items.length === 0) {
        throw new BadResponseException("No items returned from iPhone API");
      }
      this._iphoneStruct_ = items[0]!;
    }
    return this._iphoneStruct_;
  }

  private _field<T>(...keys: string[]): T {
    try {
      let d: unknown = this._node;
      for (const key of keys) {
        d = (d as JsonNode)[key];
      }
      if (d === undefined) throw new Error("Key not found");
      return d as T;
    } catch {
      if (!this._fullMetadataDict) {
        throw new Error("Metadata not loaded");
      }
      let d: unknown = this._fullMetadataDict;
      for (const key of keys) {
        d = (d as JsonNode)[key];
      }
      return d as T;
    }
  }

  private async _fieldWithFetch<T>(...keys: string[]): Promise<T> {
    try {
      return this._field<T>(...keys);
    } catch {
      await this._obtainMetadata();
      return this._field<T>(...keys);
    }
  }

  get ownerProfile(): Profile {
    if (!this._ownerProfile) {
      const owner = this._node["owner"] as JsonNode;
      if ("username" in owner) {
        this._ownerProfile = new Profile(this._context, owner);
      } else {
        throw new Error("Owner metadata not loaded. Call getOwnerProfile() instead.");
      }
    }
    return this._ownerProfile;
  }

  async getOwnerProfile(): Promise<Profile> {
    if (!this._ownerProfile) {
      let ownerStruct: JsonNode;
      const owner = this._node["owner"] as JsonNode | undefined;
      if (owner && "username" in owner) {
        ownerStruct = owner;
      } else {
        const fullMetadata = await this._getFullMetadata();
        ownerStruct = fullMetadata["owner"] as JsonNode;
      }
      this._ownerProfile = new Profile(this._context, ownerStruct);
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
    const owner = this._node["owner"] as JsonNode | undefined;
    if (owner && "id" in owner) {
      return Number(owner["id"]);
    }
    return this.ownerProfile.userid;
  }

  async getOwnerId(): Promise<number> {
    const owner = this._node["owner"] as JsonNode | undefined;
    if (owner && "id" in owner) {
      return Number(owner["id"]);
    }
    const profile = await this.getOwnerProfile();
    return profile.userid;
  }

  get dateLocal(): Date {
    const timestamp = this._getTimestampDateCreated();
    return new Date(timestamp * 1000);
  }

  get dateUtc(): Date {
    const timestamp = this._getTimestampDateCreated();
    return new Date(timestamp * 1000);
  }

  get date(): Date {
    return this.dateUtc;
  }

  get profile(): string {
    return this.ownerUsername;
  }

  get url(): string {
    return this._node["display_url"] as string ?? this._node["display_src"] as string;
  }

  async getUrl(): Promise<string> {
    if (this.typename === "GraphImage" && this._context.iphoneSupport && this._context.isLoggedIn) {
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
        this._context.error(`Unable to fetch high quality image version of ${this}: ${err}`);
      }
    }
    return this._node["display_url"] as string ?? this._node["display_src"] as string;
  }

  get typename(): string {
    return this._field<string>("__typename");
  }

  async getTypename(): Promise<string> {
    return this._fieldWithFetch<string>("__typename");
  }

  get mediacount(): number {
    if (this.typename === "GraphSidecar") {
      const edges = this._field<JsonNode[]>("edge_sidecar_to_children", "edges");
      return edges.length;
    }
    return 1;
  }

  async getMediacount(): Promise<number> {
    const typename = await this.getTypename();
    if (typename === "GraphSidecar") {
      const edges = await this._fieldWithFetch<JsonNode[]>("edge_sidecar_to_children", "edges");
      return edges.length;
    }
    return 1;
  }

  private _getTimestampDateCreated(): number {
    if ("date" in this._node) {
      return this._node["date"] as number;
    }
    return this._node["taken_at_timestamp"] as number;
  }

  getIsVideos(): boolean[] {
    if (this.typename === "GraphSidecar") {
      const edges = this._field<JsonNode[]>("edge_sidecar_to_children", "edges");
      return edges.map((edge) => (edge["node"] as JsonNode)["is_video"] as boolean);
    }
    return [this.isVideo];
  }

  async getSidecarNodes(start = 0, end = -1): Promise<PostSidecarNode[]> {
    if (this.typename !== "GraphSidecar") {
      return [];
    }

    let edges = this._field<JsonNode[]>("edge_sidecar_to_children", "edges");
    const actualEnd = end < 0 ? edges.length - 1 : end;
    const actualStart = start < 0 ? edges.length - 1 : start;

    const needsFullMetadata = edges
      .slice(actualStart, actualEnd + 1)
      .some((edge) => {
        const node = edge["node"] as JsonNode;
        return node["is_video"] && !("video_url" in node);
      });

    if (needsFullMetadata) {
      const fullMetadata = await this._getFullMetadata();
      edges = (fullMetadata["edge_sidecar_to_children"] as JsonNode)["edges"] as JsonNode[];
    }

    const result: PostSidecarNode[] = [];
    for (let idx = 0; idx < edges.length; idx++) {
      if (idx >= actualStart && idx <= actualEnd) {
        const edgeItem = edges[idx];
        if (!edgeItem) continue;
        const node = edgeItem["node"] as JsonNode;
        const isVideo = node["is_video"] as boolean;
        let displayUrl = node["display_url"] as string;

        if (!isVideo && this._context.iphoneSupport && this._context.isLoggedIn) {
          try {
            const iphoneStruct = await this.getIphoneStruct();
            const carouselMedia = iphoneStruct["carousel_media"] as JsonNode[] | undefined;
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
          } catch (err) {
            this._context.error(`Unable to fetch high quality image version of ${this}: ${err}`);
          }
        }

        result.push({
          isVideo,
          displayUrl,
          videoUrl: isVideo ? (node["video_url"] as string) : null,
        });
      }
    }

    return result;
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
    return Array.from(matches, (m) => m[1]).filter((s): s is string => s !== undefined);
  }

  get captionMentions(): string[] {
    if (!this.caption) {
      return [];
    }
    const matches = this.caption.toLowerCase().matchAll(MENTION_REGEX);
    return Array.from(matches, (m) => m[1]).filter((s): s is string => s !== undefined);
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

  get accessibilityCaption(): string | null {
    try {
      return this._field<string>("accessibility_caption");
    } catch {
      return null;
    }
  }

  get taggedUsers(): string[] {
    try {
      const edges = this._field<JsonNode[]>("edge_media_to_tagged_user", "edges");
      return edges.map((edge) => {
        const user = (edge["node"] as JsonNode)["user"] as JsonNode;
        return (user["username"] as string).toLowerCase();
      });
    } catch {
      return [];
    }
  }

  get isVideo(): boolean {
    return this._node["is_video"] as boolean;
  }

  get videoUrl(): string | null {
    if (!this.isVideo) {
      return null;
    }
    try {
      return this._field<string>("video_url");
    } catch {
      return null;
    }
  }

  async getVideoUrl(): Promise<string | null> {
    if (!this.isVideo) {
      return null;
    }

    const versionUrls: string[] = [];

    try {
      const graphqlUrl = await this._fieldWithFetch<string>("video_url");
      versionUrls.push(graphqlUrl);
    } catch (err) {
      this._context.error(`Warning: Unable to fetch video from graphql of ${this}: ${err}`);
    }

    if (this._context.iphoneSupport && this._context.isLoggedIn) {
      try {
        const iphoneStruct = await this.getIphoneStruct();
        const videoVersions = iphoneStruct["video_versions"] as JsonNode[];
        for (const version of videoVersions) {
          versionUrls.push(version["url"] as string);
        }
      } catch (err) {
        this._context.error(`Unable to fetch high-quality video version of ${this}: ${err}`);
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
        const contentLength = parseInt(response.headers.get("Content-Length") ?? "0", 10);
        candidates.push([contentLength, url]);
      } catch (err) {
        this._context.error(`Video URL candidate ${idx + 1}/${uniqueUrls.length} for ${this}: ${err}`);
      }
    }

    if (candidates.length === 0) {
      return uniqueUrls[0] ?? null;
    }

    candidates.sort((a, b) => a[0] - b[0]);
    const lastCandidate = candidates[candidates.length - 1];
    return lastCandidate ? lastCandidate[1] : null;
  }

  get videoViewCount(): number | null {
    if (!this.isVideo) {
      return null;
    }
    return this._field<number>("video_view_count");
  }

  get videoPlayCount(): number | null {
    if (!this.isVideo) {
      return null;
    }
    try {
      return this._field<number>("video_play_count");
    } catch {
      return null;
    }
  }

  get videoDuration(): number | null {
    if (!this.isVideo) {
      return null;
    }
    try {
      return this._field<number>("video_duration");
    } catch {
      return null;
    }
  }

  get viewerHasLiked(): boolean | null {
    if (!this._context.isLoggedIn) {
      return null;
    }
    const likes = this._node["likes"] as JsonNode | undefined;
    if (likes && "viewer_has_liked" in likes) {
      return likes["viewer_has_liked"] as boolean;
    }
    return this._field<boolean>("viewer_has_liked");
  }

  get likes(): number {
    return this._field<number>("edge_media_preview_like", "count");
  }

  get comments(): number {
    if ("comments" in this._node && typeof this._node["comments"] === "number") {
      return this._node["comments"] as number;
    }
    const edgeMediaToComment = this._node["edge_media_to_comment"] as JsonNode | undefined;
    if (edgeMediaToComment && "count" in edgeMediaToComment) {
      return edgeMediaToComment["count"] as number;
    }
    try {
      return this._field<number>("edge_media_to_parent_comment", "count");
    } catch {
      return this._field<number>("edge_media_to_comment", "count");
    }
  }

  get isSponsored(): boolean {
    try {
      const sponsorEdges = this._field<JsonNode[]>("edge_media_to_sponsor_user", "edges");
      return sponsorEdges.length > 0;
    } catch {
      return false;
    }
  }

  async getSponsorUsers(): Promise<Profile[]> {
    if (!this.isSponsored) {
      return [];
    }
    const edges = this._field<JsonNode[]>("edge_media_to_sponsor_user", "edges");
    return edges.map((edge) => {
      const sponsor = (edge["node"] as JsonNode)["sponsor"] as JsonNode;
      return new Profile(this._context, sponsor);
    });
  }

  async getLocation(): Promise<PostLocation | null> {
    if (this._location) {
      return this._location;
    }

    const loc = await this._fieldWithFetch<JsonNode | null>("location");
    if (!loc) {
      return null;
    }

    if (!this._context.isLoggedIn) {
      return null;
    }

    const locationId = Number(loc["id"]);
    const requiredKeys = ["name", "slug", "has_public_page", "lat", "lng"];
    const missingKeys = requiredKeys.some((k) => !(k in loc));

    if (missingKeys) {
      const locationData = await this._context.getJson(
        `explore/locations/${locationId}/`,
        { __a: "1", __d: "dis" },
      );
      const locationInfo = (locationData["native_location_data"] as JsonNode)["location_info"] as JsonNode;
      Object.assign(loc, locationInfo);
    }

    this._location = {
      id: locationId,
      name: loc["name"] as string,
      slug: loc["slug"] as string,
      hasPublicPage: loc["has_public_page"] as boolean | null,
      lat: loc["lat"] as number | null ?? null,
      lng: loc["lng"] as number | null ?? null,
    };

    return this._location;
  }

  get isPinned(): boolean {
    const pinnedForUsers = this._node["pinned_for_users"] as unknown[] | undefined;
    return pinnedForUsers !== undefined && pinnedForUsers.length > 0;
  }
}
