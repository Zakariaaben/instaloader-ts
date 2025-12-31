import { InstaloaderContext } from "../core/context.ts";
import type { JsonNode } from "../structures/common.ts";

export class SectionIterator<T> implements AsyncIterable<T> {
  private _context: InstaloaderContext;
  private _sectionsExtractor: (data: JsonNode) => JsonNode;
  private _mediaWrapper: (media: JsonNode) => T;
  private _queryPath: string;
  private _data: JsonNode | null = null;
  private _pageIndex: number = 0;
  private _sectionIndex: number = 0;
  private _initialized: boolean = false;
  private _firstData: JsonNode | null;

  constructor(
    context: InstaloaderContext,
    sectionsExtractor: (data: JsonNode) => JsonNode,
    mediaWrapper: (media: JsonNode) => T,
    queryPath: string,
    firstData?: JsonNode,
  ) {
    this._context = context;
    this._sectionsExtractor = sectionsExtractor;
    this._mediaWrapper = mediaWrapper;
    this._queryPath = queryPath;
    this._firstData = firstData ?? null;
  }

  private async _ensureInitialized(): Promise<void> {
    if (!this._initialized) {
      if (this._firstData) {
        this._data = this._firstData;
      } else {
        this._data = await this._query();
      }
      this._initialized = true;
    }
  }

  private async _query(maxId?: string): Promise<JsonNode> {
    const params: Record<string, string> = { __a: "1", __d: "dis" };
    if (maxId !== undefined) {
      params["max_id"] = maxId;
    }
    const result = await this._context.getJson(this._queryPath, params);
    return this._sectionsExtractor(result);
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    await this._ensureInitialized();

    while (true) {
      const sections = this._data!["sections"] as JsonNode[];

      while (this._pageIndex < sections.length) {
        const section = sections[this._pageIndex]!;
        const layoutContent = section["layout_content"] as JsonNode;
        const medias = layoutContent["medias"] as JsonNode[];

        while (this._sectionIndex < medias.length) {
          const mediaWrapper = medias[this._sectionIndex]!;
          const media = mediaWrapper["media"] as JsonNode;

          this._sectionIndex++;

          yield this._mediaWrapper(media);
        }

        this._sectionIndex = 0;
        this._pageIndex++;
      }

      const moreAvailable = this._data!["more_available"] as boolean;
      if (!moreAvailable) {
        break;
      }

      const nextMaxId = this._data!["next_max_id"] as string;
      this._pageIndex = 0;
      this._sectionIndex = 0;
      this._data = await this._query(nextMaxId);
    }
  }
}
