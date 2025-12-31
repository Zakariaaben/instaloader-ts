import { InstaloaderContext } from "../core/context.ts";
import { type JsonNode } from "./common.ts";
import { Post } from "./post.ts";

export class Hashtag {
  private _context: InstaloaderContext;
  private _node: JsonNode;
  private _hasFullMetadata: boolean = false;

  constructor(context: InstaloaderContext, node: JsonNode) {
    if (!("name" in node)) {
      throw new Error("Hashtag node must have 'name' property");
    }
    this._context = context;
    this._node = node;
  }

  static async fromName(
    context: InstaloaderContext,
    name: string,
  ): Promise<Hashtag> {
    const hashtag = new Hashtag(context, { name: name.toLowerCase() });
    await hashtag._obtainMetadata();
    return hashtag;
  }

  get name(): string {
    return (this._node["name"] as string).toLowerCase();
  }

  private async _query(params: Record<string, unknown>): Promise<JsonNode> {
    const jsonResponse = await this._context.getIphoneJson(
      "api/v1/tags/web_info/",
      { ...params, tag_name: this.name },
    );
    if ("graphql" in jsonResponse) {
      return (jsonResponse["graphql"] as JsonNode)["hashtag"] as JsonNode;
    }
    return jsonResponse["data"] as JsonNode;
  }

  private async _obtainMetadata(): Promise<void> {
    if (!this._hasFullMetadata) {
      this._node = await this._query({ __a: 1, __d: "dis" });
      this._hasFullMetadata = true;
    }
  }

  _asdict(): JsonNode {
    const jsonNode = { ...this._node };
    delete jsonNode["edge_hashtag_to_top_posts"];
    delete jsonNode["top"];
    delete jsonNode["edge_hashtag_to_media"];
    delete jsonNode["recent"];
    return jsonNode;
  }

  toString(): string {
    return `<Hashtag #${this.name}>`;
  }

  equals(other: Hashtag): boolean {
    return this.name === other.name;
  }

  private async _metadata<T>(...keys: string[]): Promise<T> {
    let d: unknown = this._node;
    try {
      for (const key of keys) {
        d = (d as JsonNode)[key];
        if (d === undefined) {
          throw new Error("Key not found");
        }
      }
      return d as T;
    } catch {
      await this._obtainMetadata();
      d = this._node;
      for (const key of keys) {
        d = (d as JsonNode)[key];
      }
      return d as T;
    }
  }

  async getHashtagid(): Promise<number> {
    return Number(await this._metadata<string>("id"));
  }

  async getProfilePicUrl(): Promise<string> {
    return await this._metadata<string>("profile_pic_url");
  }

  async getDescription(): Promise<string | null> {
    return await this._metadata<string | null>("description");
  }

  async getAllowFollowing(): Promise<boolean> {
    return Boolean(await this._metadata<boolean>("allow_following"));
  }

  async getIsFollowing(): Promise<boolean> {
    try {
      return await this._metadata<boolean>("is_following");
    } catch {
      return Boolean(await this._metadata<boolean>("following"));
    }
  }

  async *getTopPosts(): AsyncGenerator<Post> {
    try {
      const edges = await this._metadata<JsonNode[]>("edge_hashtag_to_top_posts", "edges");
      for (const edge of edges) {
        const node = edge["node"] as JsonNode;
        yield new Post(this._context, node);
      }
    } catch {
      const topData = await this._metadata<JsonNode>("top");
      if (topData && "sections" in topData) {
        const sections = topData["sections"] as JsonNode[];
        for (const section of sections) {
          const layoutContent = section["layout_content"] as JsonNode;
          const medias = layoutContent["medias"] as JsonNode[];
          for (const mediaWrapper of medias) {
            const media = mediaWrapper["media"] as JsonNode;
            yield Post.fromIphoneStruct(this._context, media);
          }
        }
      }
    }
  }

  async getMediacount(): Promise<number> {
    try {
      return await this._metadata<number>("edge_hashtag_to_media", "count");
    } catch {
      return await this._metadata<number>("media_count");
    }
  }

  async *getPosts(): AsyncGenerator<Post> {
    try {
      let edges = await this._metadata<JsonNode[]>("edge_hashtag_to_media", "edges");
      let pageInfo = await this._metadata<JsonNode>("edge_hashtag_to_media", "page_info");

      for (const edge of edges) {
        const node = edge["node"] as JsonNode;
        yield new Post(this._context, node);
      }

      while (pageInfo["has_next_page"]) {
        const data = await this._query({
          __a: 1,
          max_id: pageInfo["end_cursor"],
        });
        const conn = data["edge_hashtag_to_media"] as JsonNode;
        edges = conn["edges"] as JsonNode[];
        pageInfo = conn["page_info"] as JsonNode;

        for (const edge of edges) {
          const node = edge["node"] as JsonNode;
          yield new Post(this._context, node);
        }
      }
    } catch {
      const recentData = await this._metadata<JsonNode>("recent");
      if (recentData && "sections" in recentData) {
        const sections = recentData["sections"] as JsonNode[];
        for (const section of sections) {
          const layoutContent = section["layout_content"] as JsonNode;
          const medias = layoutContent["medias"] as JsonNode[];
          for (const mediaWrapper of medias) {
            const media = mediaWrapper["media"] as JsonNode;
            yield Post.fromIphoneStruct(this._context, media);
          }
        }
      }
    }
  }

  async *getAllPosts(): AsyncGenerator<Post> {
    const topPosts: Post[] = [];
    let count = 0;
    for await (const post of this.getTopPosts()) {
      topPosts.push(post);
      count++;
      if (count >= 9) break;
    }
    const sortedTopPosts = topPosts.sort(
      (a, b) => b.dateUtc.getTime() - a.dateUtc.getTime(),
    );
    let topIdx = 0;
    const seenShortcodes = new Set<string>();

    const otherPosts = this.getPosts();
    let nextTop: Post | null = sortedTopPosts[topIdx] ?? null;
    topIdx++;
    let nextOther: Post | null = null;

    const otherResult = await otherPosts.next();
    if (!otherResult.done) {
      nextOther = otherResult.value;
    }

    while (nextTop !== null || nextOther !== null) {
      if (nextOther === null) {
        if (nextTop !== null && !seenShortcodes.has(nextTop.shortcode)) {
          seenShortcodes.add(nextTop.shortcode);
          yield nextTop;
        }
        while (topIdx < sortedTopPosts.length) {
          const p = sortedTopPosts[topIdx];
          topIdx++;
          if (p && !seenShortcodes.has(p.shortcode)) {
            seenShortcodes.add(p.shortcode);
            yield p;
          }
        }
        break;
      }

      if (nextTop === null) {
        if (!seenShortcodes.has(nextOther.shortcode)) {
          seenShortcodes.add(nextOther.shortcode);
          yield nextOther;
        }
        for await (const p of otherPosts) {
          if (!seenShortcodes.has(p.shortcode)) {
            seenShortcodes.add(p.shortcode);
            yield p;
          }
        }
        break;
      }

      if (nextTop.shortcode === nextOther.shortcode) {
        seenShortcodes.add(nextTop.shortcode);
        yield nextTop;
        nextTop = sortedTopPosts[topIdx] ?? null;
        topIdx++;
        const result = await otherPosts.next();
        nextOther = result.done ? null : result.value;
        continue;
      }

      if (nextTop.dateUtc.getTime() > nextOther.dateUtc.getTime()) {
        if (!seenShortcodes.has(nextTop.shortcode)) {
          seenShortcodes.add(nextTop.shortcode);
          yield nextTop;
        }
        nextTop = sortedTopPosts[topIdx] ?? null;
        topIdx++;
      } else {
        if (!seenShortcodes.has(nextOther.shortcode)) {
          seenShortcodes.add(nextOther.shortcode);
          yield nextOther;
        }
        const result = await otherPosts.next();
        nextOther = result.done ? null : result.value;
      }
    }
  }
}
