import { InstaloaderContext } from "../core/context.ts";
import { type JsonNode } from "./common.ts";
import { Profile } from "./profile.ts";
import { Story, StoryItem } from "./story.ts";

export class Highlight extends Story {
  private _items: JsonNode[] | null = null;

  constructor(
    context: InstaloaderContext,
    node: JsonNode,
    owner?: Profile,
  ) {
    super(context, node);
    if (owner) {
      this._ownerProfile = owner;
    }
  }

  override toString(): string {
    return `<Highlight by ${this.ownerUsername}: ${this.title}>`;
  }

  override get uniqueId(): number {
    return Number(this._node["id"]);
  }

  override get ownerProfile(): Profile {
    if (!this._ownerProfile) {
      const owner = this._node["owner"] as JsonNode;
      this._ownerProfile = new Profile(this._context, owner);
    }
    return this._ownerProfile;
  }

  get title(): string {
    return this._node["title"] as string;
  }

  get coverUrl(): string {
    const coverMedia = this._node["cover_media"] as JsonNode;
    return coverMedia["thumbnail_src"] as string;
  }

  get coverCroppedUrl(): string {
    const coverMediaCropped = this._node["cover_media_cropped_thumbnail"] as JsonNode;
    return coverMediaCropped["url"] as string;
  }

  private async _fetchItems(): Promise<void> {
    if (!this._items) {
      const data = await this._context.graphqlQuery(
        "45246d3fe16ccc6577e0bd297a5db1ab",
        {
          reel_ids: [],
          tag_names: [],
          location_ids: [],
          highlight_reel_ids: [String(this.uniqueId)],
          precomposed_overlay: false,
        },
      );
      const dataNode = data["data"] as JsonNode | null;
      if (!dataNode) {
        this._items = [];
        return;
      }
      const reelsMedia = dataNode["reels_media"] as JsonNode[] | null;
      if (!reelsMedia || reelsMedia.length === 0) {
        this._items = [];
        return;
      }
      const firstReel = reelsMedia[0] as JsonNode;
      this._items = (firstReel["items"] as JsonNode[]) ?? [];
    }
  }

  protected override async _fetchIphoneStruct(): Promise<void> {
    if (
      this._context.iphoneSupport &&
      this._context.isLoggedIn &&
      !this._iphoneStruct_
    ) {
      const data = await this._context.getIphoneJson(
        `api/v1/feed/reels_media/?reel_ids=highlight:${this.uniqueId}`,
        {},
      );
      const reels = data["reels"] as JsonNode;
      this._iphoneStruct_ = reels[`highlight:${this.uniqueId}`] as JsonNode;
    }
  }

  override get itemcount(): number {
    if (!this._items) {
      throw new Error("Items not fetched. Call getItemcount() instead.");
    }
    return this._items.length;
  }

  async getItemcount(): Promise<number> {
    await this._fetchItems();
    return this._items!.length;
  }

  override async *getItems(): AsyncGenerator<StoryItem> {
    await this._fetchItems();
    await this._fetchIphoneStruct();

    for (const item of this._items!) {
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
