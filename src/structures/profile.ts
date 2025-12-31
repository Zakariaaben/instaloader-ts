import { InstaloaderContext } from "../core/context.ts";
import {
  IPhoneSupportDisabledException,
  LoginRequiredException,
  ProfileNotExistsException,
  QueryReturnedNotFoundException,
} from "../exceptions/index.ts";
import {
  HASHTAG_REGEX,
  MENTION_REGEX,
  type JsonNode,
} from "./common.ts";
import { NodeIterator } from "../iterators/node-iterator.ts";
import { Post } from "./post.ts";

export class Profile {
  private _context: InstaloaderContext;
  private _node: JsonNode;
  private _hasFullMetadata = false;
  private _hasPublicStory: boolean | null = null;
  private _iphoneStruct_: JsonNode | null = null;

  constructor(context: InstaloaderContext, node: JsonNode) {
    if (!("username" in node)) {
      throw new Error("Profile node must contain 'username'");
    }
    this._context = context;
    this._node = node;
    this._hasFullMetadata = false;
    if ("iphone_struct" in node) {
      this._iphoneStruct_ = node["iphone_struct"] as JsonNode;
    }
  }

  static async fromUsername(
    context: InstaloaderContext,
    username: string,
  ): Promise<Profile> {
    const profile = new Profile(context, { username: username.toLowerCase() });
    await profile._obtainMetadata();
    return profile;
  }

  static async fromId(
    context: InstaloaderContext,
    profileId: number,
  ): Promise<Profile> {
    const cached = context.profileIdCache.get(profileId);
    if (cached) {
      return cached as Profile;
    }

    const data = await context.graphqlQuery("7c16654f22c819fb63d1183034a5162f", {
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
      const profile = new Profile(context, owner);
      context.profileIdCache.set(profileId, profile);
      return profile;
    }

    throw new ProfileNotExistsException(
      `No profile found, the user may have blocked you (ID: ${profileId}).`,
    );
  }

  static fromIphoneStruct(
    context: InstaloaderContext,
    media: JsonNode,
  ): Profile {
    return new Profile(context, {
      id: media["pk"],
      username: media["username"],
      is_private: media["is_private"],
      full_name: media["full_name"],
      profile_pic_url_hd: media["profile_pic_url"],
      iphone_struct: media,
    });
  }

  static async ownProfile(context: InstaloaderContext): Promise<Profile> {
    if (!context.isLoggedIn) {
      throw new LoginRequiredException("Login required to access own profile.");
    }
    const data = await context.graphqlQuery("d6f4427fbe92d846298cf93df0b937d3", {});
    const userData = (data["data"] as JsonNode)["user"] as JsonNode;
    return new Profile(context, userData);
  }

  _asdict(): JsonNode {
    const jsonNode = { ...this._node };
    delete jsonNode["edge_media_collections"];
    delete jsonNode["edge_owner_to_timeline_media"];
    delete jsonNode["edge_saved_media"];
    delete jsonNode["edge_felix_video_timeline"];
    if (this._iphoneStruct_) {
      jsonNode["iphone_struct"] = this._iphoneStruct_;
    }
    return jsonNode;
  }

  private async _obtainMetadata(): Promise<void> {
    try {
      if (!this._hasFullMetadata) {
        const metadata = await this._context.getIphoneJson(
          `api/v1/users/web_profile_info/?username=${this.username}`,
          {},
        );
        const dataNode = metadata["data"] as JsonNode | undefined;
        const userData = dataNode?.["user"] as JsonNode | null;
        if (userData === null || userData === undefined) {
          throw new ProfileNotExistsException(
            `Profile ${this.username} does not exist.`,
          );
        }
        this._node = userData;
        this._hasFullMetadata = true;
      }
    } catch (err) {
      if (err instanceof ProfileNotExistsException) {
        throw err;
      }
      if (err instanceof QueryReturnedNotFoundException) {
        throw new ProfileNotExistsException(
          `Profile ${this.username} does not exist.`,
        );
      }
      throw err;
    }
  }

  private _metadata<T>(...keys: string[]): T {
    let d: unknown = this._node;
    for (const key of keys) {
      if (d === null || d === undefined || typeof d !== "object") {
        throw new Error(`Key ${key} not found`);
      }
      d = (d as JsonNode)[key];
    }
    return d as T;
  }

  private async _metadataWithFetch<T>(...keys: string[]): Promise<T> {
    try {
      return this._metadata<T>(...keys);
    } catch {
      await this._obtainMetadata();
      return this._metadata<T>(...keys);
    }
  }

  async getIphoneStruct(): Promise<JsonNode> {
    if (!this._context.iphoneSupport) {
      throw new IPhoneSupportDisabledException("iPhone support is disabled.");
    }
    if (!this._context.isLoggedIn) {
      throw new LoginRequiredException(
        "Login required to access iPhone profile info endpoint.",
      );
    }
    if (!this._iphoneStruct_) {
      const data = await this._context.getIphoneJson(
        `api/v1/users/${this.userid}/info/`,
        {},
      );
      this._iphoneStruct_ = data["user"] as JsonNode;
    }
    return this._iphoneStruct_;
  }

  get userid(): number {
    return Number(this._metadata<string | number>("id"));
  }

  get username(): string {
    return (this._metadata<string>("username")).toLowerCase();
  }

  toString(): string {
    return `<Profile ${this.username} (${this.userid})>`;
  }

  equals(other: Profile): boolean {
    return this.userid === other.userid;
  }

  get isPrivate(): boolean {
    return this._metadata<boolean>("is_private");
  }

  async getIsPrivate(): Promise<boolean> {
    return this._metadataWithFetch<boolean>("is_private");
  }

  get followedByViewer(): boolean {
    return this._metadata<boolean>("followed_by_viewer");
  }

  async getFollowedByViewer(): Promise<boolean> {
    return this._metadataWithFetch<boolean>("followed_by_viewer");
  }

  get mediacount(): number {
    return this._metadata<number>("edge_owner_to_timeline_media", "count");
  }

  async getMediacount(): Promise<number> {
    return this._metadataWithFetch<number>("edge_owner_to_timeline_media", "count");
  }

  get igtvcount(): number {
    return this._metadata<number>("edge_felix_video_timeline", "count");
  }

  async getIgtvcount(): Promise<number> {
    return this._metadataWithFetch<number>("edge_felix_video_timeline", "count");
  }

  get followers(): number {
    return this._metadata<number>("edge_followed_by", "count");
  }

  async getFollowers(): Promise<number> {
    return this._metadataWithFetch<number>("edge_followed_by", "count");
  }

  get followees(): number {
    return this._metadata<number>("edge_follow", "count");
  }

  async getFollowees(): Promise<number> {
    return this._metadataWithFetch<number>("edge_follow", "count");
  }

  get externalUrl(): string | null {
    try {
      return this._metadata<string | null>("external_url");
    } catch {
      return null;
    }
  }

  async getExternalUrl(): Promise<string | null> {
    try {
      return await this._metadataWithFetch<string | null>("external_url");
    } catch {
      return null;
    }
  }

  get isBusinessAccount(): boolean {
    return this._metadata<boolean>("is_business_account");
  }

  async getIsBusinessAccount(): Promise<boolean> {
    return this._metadataWithFetch<boolean>("is_business_account");
  }

  get businessCategoryName(): string {
    return this._metadata<string>("business_category_name");
  }

  async getBusinessCategoryName(): Promise<string> {
    return this._metadataWithFetch<string>("business_category_name");
  }

  get biography(): string {
    return this._metadata<string>("biography").normalize("NFC");
  }

  async getBiography(): Promise<string> {
    const bio = await this._metadataWithFetch<string>("biography");
    return bio.normalize("NFC");
  }

  get biographyHashtags(): string[] {
    if (!this.biography) {
      return [];
    }
    const matches = this.biography.toLowerCase().matchAll(HASHTAG_REGEX);
    return Array.from(matches, (m) => m[1]).filter((s): s is string => s !== undefined);
  }

  get biographyMentions(): string[] {
    if (!this.biography) {
      return [];
    }
    const matches = this.biography.toLowerCase().matchAll(MENTION_REGEX);
    return Array.from(matches, (m) => m[1]).filter((s): s is string => s !== undefined);
  }

  get blockedByViewer(): boolean {
    return this._metadata<boolean>("blocked_by_viewer");
  }

  async getBlockedByViewer(): Promise<boolean> {
    return this._metadataWithFetch<boolean>("blocked_by_viewer");
  }

  get followsViewer(): boolean {
    return this._metadata<boolean>("follows_viewer");
  }

  async getFollowsViewer(): Promise<boolean> {
    return this._metadataWithFetch<boolean>("follows_viewer");
  }

  get fullName(): string {
    return this._metadata<string>("full_name");
  }

  async getFullName(): Promise<string> {
    return this._metadataWithFetch<string>("full_name");
  }

  get hasBlockedViewer(): boolean {
    return this._metadata<boolean>("has_blocked_viewer");
  }

  async getHasBlockedViewer(): Promise<boolean> {
    return this._metadataWithFetch<boolean>("has_blocked_viewer");
  }

  get hasHighlightReels(): boolean {
    return true;
  }

  async getHasPublicStory(): Promise<boolean> {
    if (this._hasPublicStory === null) {
      await this._obtainMetadata();
      const data = await this._context.graphqlQuery(
        "9ca88e465c3f866a76f7adee3871bdd8",
        {
          user_id: this.userid,
          include_chaining: false,
          include_reel: false,
          include_suggested_users: false,
          include_logged_out_extras: true,
          include_highlight_reels: false,
        },
        `https://www.instagram.com/${this.username}/`,
      );
      this._hasPublicStory = ((data["data"] as JsonNode)["user"] as JsonNode)[
        "has_public_story"
      ] as boolean;
    }
    return this._hasPublicStory;
  }

  get hasRequestedViewer(): boolean {
    return this._metadata<boolean>("has_requested_viewer");
  }

  async getHasRequestedViewer(): Promise<boolean> {
    return this._metadataWithFetch<boolean>("has_requested_viewer");
  }

  get isVerified(): boolean {
    return this._metadata<boolean>("is_verified");
  }

  async getIsVerified(): Promise<boolean> {
    return this._metadataWithFetch<boolean>("is_verified");
  }

  get requestedByViewer(): boolean {
    return this._metadata<boolean>("requested_by_viewer");
  }

  async getRequestedByViewer(): Promise<boolean> {
    return this._metadataWithFetch<boolean>("requested_by_viewer");
  }

  get profilePicUrl(): string {
    return this._metadata<string>("profile_pic_url_hd");
  }

  async getProfilePicUrl(): Promise<string> {
    if (this._context.iphoneSupport && this._context.isLoggedIn) {
      try {
        const iphoneStruct = await this.getIphoneStruct();
        const hdPicInfo = iphoneStruct["hd_profile_pic_url_info"] as JsonNode;
        return hdPicInfo["url"] as string;
      } catch (err) {
        this._context.error(`Unable to fetch high quality profile pic: ${err}`);
        return this._metadataWithFetch<string>("profile_pic_url_hd");
      }
    }
    return this._metadataWithFetch<string>("profile_pic_url_hd");
  }

  get profilePicUrlNoIphone(): string {
    return this._metadata<string>("profile_pic_url_hd");
  }

  async getProfilePicUrlNoIphone(): Promise<string> {
    return this._metadataWithFetch<string>("profile_pic_url_hd");
  }

  private static _makeIsNewestChecker(): (post: Post, first: Post | null) => boolean {
    return (post: Post, first: Post | null) => first === null || post.dateLocal > first.dateLocal;
  }

  getPosts(): NodeIterator<Post> {
    const loggedIn = this._context.isLoggedIn;
    const context = this._context;
    const self = this;

    const queryHash = loggedIn ? null : "7950326061742207";

    return new NodeIterator<Post>(
      this._context,
      queryHash,
      loggedIn
        ? (d: JsonNode) => (d["data"] as JsonNode)["xdt_api__v1__feed__user_timeline_graphql_connection"] as JsonNode
        : (d: JsonNode) => ((d["data"] as JsonNode)["user"] as JsonNode)["edge_owner_to_timeline_media"] as JsonNode,
      loggedIn
        ? (n: JsonNode) => Post.fromIphoneStruct(context, n)
        : (n: JsonNode) => new Post(context, n, self),
      {
        data: {
          count: 12,
          include_relationship_info: true,
          latest_besties_reel_media: true,
          latest_reel_media: true,
        },
        ...(loggedIn ? { username: this.username } : { id: this.userid }),
      },
      `https://www.instagram.com/${this.username}/`,
      loggedIn ? undefined : this._node["edge_owner_to_timeline_media"] as JsonNode | undefined,
      Profile._makeIsNewestChecker(),
      loggedIn ? "7898261790222653" : undefined,
    );
  }

  getSavedPosts(): NodeIterator<Post> {
    if (this.username !== this._context.username) {
      throw new LoginRequiredException(
        `Login as ${this.username} required to get that profile's saved posts.`,
      );
    }

    const context = this._context;
    return new NodeIterator<Post>(
      this._context,
      "f883d95537fbcd400f466f63d42bd8a1",
      (d: JsonNode) => ((d["data"] as JsonNode)["user"] as JsonNode)["edge_saved_media"] as JsonNode,
      (n: JsonNode) => new Post(context, n),
      { id: this.userid },
      `https://www.instagram.com/${this.username}/`,
    );
  }

  getTaggedPosts(): NodeIterator<Post> {
    const context = this._context;
    const self = this;

    return new NodeIterator<Post>(
      this._context,
      "e31a871f7301132ceaab56507a66bbb7",
      (d: JsonNode) => ((d["data"] as JsonNode)["user"] as JsonNode)["edge_user_to_photos_of_you"] as JsonNode,
      (n: JsonNode) => {
        const ownerId = Number(((n["owner"] as JsonNode)["id"]));
        return new Post(context, n, ownerId === self.userid ? self : undefined);
      },
      { id: this.userid },
      `https://www.instagram.com/${this.username}/`,
      undefined,
      Profile._makeIsNewestChecker(),
    );
  }

  getReels(): NodeIterator<Post> {
    const context = this._context;

    return new NodeIterator<Post>(
      this._context,
      null,
      (d: JsonNode) => (d["data"] as JsonNode)["xdt_api__v1__clips__user__connection_v2"] as JsonNode,
      (n: JsonNode) => Post.fromShortcode(context, (n["media"] as JsonNode)["code"] as string) as unknown as Post,
      {
        data: {
          page_size: 12,
          include_feed_video: true,
          target_user_id: String(this.userid),
        },
      },
      `https://www.instagram.com/${this.username}/`,
      undefined,
      Profile._makeIsNewestChecker(),
      "7845543455542541",
    );
  }

  getIgtvPosts(): NodeIterator<Post> {
    const context = this._context;
    const self = this;

    return new NodeIterator<Post>(
      this._context,
      "bc78b344a68ed16dd5d7f264681c4c76",
      (d: JsonNode) => ((d["data"] as JsonNode)["user"] as JsonNode)["edge_felix_video_timeline"] as JsonNode,
      (n: JsonNode) => new Post(context, n, self),
      { id: this.userid },
      `https://www.instagram.com/${this.username}/channel/`,
      this._node["edge_felix_video_timeline"] as JsonNode | undefined,
      Profile._makeIsNewestChecker(),
    );
  }
}
