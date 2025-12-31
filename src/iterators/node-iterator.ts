import { InstaloaderContext } from "../core/context.ts";
import { InvalidArgumentException } from "../exceptions/index.ts";
import type { JsonNode } from "../structures/common.ts";

export interface FrozenNodeIterator {
  queryHash: string | null;
  queryVariables: Record<string, unknown>;
  queryReferer: string | null;
  contextUsername: string | null;
  totalIndex: number;
  bestBefore: number | null;
  remainingData: JsonNode | null;
  firstNode: JsonNode | null;
  docId: string | null;
}

export class NodeIterator<T> implements AsyncIterable<T> {
  private static readonly _graphqlPageLength = 12;
  private static readonly _shelfLifeMs = 29 * 24 * 60 * 60 * 1000;

  private _context: InstaloaderContext;
  private _queryHash: string | null;
  private _docId: string | null;
  private _edgeExtractor: (data: JsonNode) => JsonNode;
  private _nodeWrapper: (node: JsonNode) => T;
  private _queryVariables: Record<string, unknown>;
  private _queryReferer: string | null;
  private _pageIndex: number = 0;
  private _totalIndex: number = 0;
  private _data: JsonNode | null = null;
  private _bestBefore: Date | null = null;
  private _firstNode: JsonNode | null = null;
  private _isFirst: ((item: T, firstItem: T | null) => boolean) | null;
  private _initialized: boolean = false;

  constructor(
    context: InstaloaderContext,
    queryHash: string | null,
    edgeExtractor: (data: JsonNode) => JsonNode,
    nodeWrapper: (node: JsonNode) => T,
    queryVariables?: Record<string, unknown>,
    queryReferer?: string,
    firstData?: JsonNode,
    isFirst?: (item: T, firstItem: T | null) => boolean,
    docId?: string,
  ) {
    this._context = context;
    this._queryHash = queryHash;
    this._docId = docId ?? null;
    this._edgeExtractor = edgeExtractor;
    this._nodeWrapper = nodeWrapper;
    this._queryVariables = queryVariables ?? {};
    this._queryReferer = queryReferer ?? null;
    this._isFirst = isFirst ?? null;

    if (firstData !== undefined) {
      this._data = firstData;
      this._bestBefore = new Date(Date.now() + NodeIterator._shelfLifeMs);
      this._initialized = true;
    }
  }

  private async _ensureInitialized(): Promise<void> {
    if (!this._initialized) {
      this._data = await this._query();
      this._initialized = true;
    }
  }

  private async _query(after?: string): Promise<JsonNode> {
    if (this._docId !== null) {
      return this._queryDocId(this._docId, after);
    } else {
      if (this._queryHash === null) {
        throw new Error("queryHash is required when docId is not provided");
      }
      return this._queryQueryHash(this._queryHash, after);
    }
  }

  private async _queryDocId(docId: string, after?: string): Promise<JsonNode> {
    const paginationVariables: Record<string, unknown> = {
      __relay_internal__pv__PolarisFeedShareMenurelayprovider: false,
    };
    if (after !== undefined) {
      paginationVariables["after"] = after;
      paginationVariables["before"] = null;
      paginationVariables["first"] = 12;
      paginationVariables["last"] = null;
    }
    const result = await this._context.docIdGraphqlQuery(
      docId,
      { ...this._queryVariables, ...paginationVariables },
      this._queryReferer ?? undefined,
    );
    const data = this._edgeExtractor(result);
    this._bestBefore = new Date(Date.now() + NodeIterator._shelfLifeMs);
    return data;
  }

  private async _queryQueryHash(
    queryHash: string,
    after?: string,
  ): Promise<JsonNode> {
    const paginationVariables: Record<string, unknown> = {
      first: NodeIterator._graphqlPageLength,
    };
    if (after !== undefined) {
      paginationVariables["after"] = after;
    }
    const result = await this._context.graphqlQuery(
      queryHash,
      { ...this._queryVariables, ...paginationVariables },
      this._queryReferer ?? undefined,
    );
    const data = this._edgeExtractor(result);
    this._bestBefore = new Date(Date.now() + NodeIterator._shelfLifeMs);
    return data;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    await this._ensureInitialized();

    while (true) {
      const edges = this._data!["edges"] as JsonNode[];

      while (this._pageIndex < edges.length) {
        const edge = edges[this._pageIndex];
        const node = edge!["node"] as JsonNode;

        this._pageIndex++;
        this._totalIndex++;

        const item = this._nodeWrapper(node);

        if (this._isFirst !== null) {
          if (this._isFirst(item, this.firstItem)) {
            this._firstNode = node;
          }
        } else {
          if (this._firstNode === null) {
            this._firstNode = node;
          }
        }

        yield item;
      }

      const pageInfo = this._data!["page_info"] as JsonNode | undefined;
      const hasNextPage = pageInfo?.["has_next_page"] as boolean | undefined;

      if (!hasNextPage) {
        break;
      }

      const endCursor = pageInfo!["end_cursor"] as string;
      const queryResponse = await this._query(endCursor);

      const oldEdges = this._data!["edges"] as JsonNode[];
      const newEdges = queryResponse["edges"] as JsonNode[];

      if (
        JSON.stringify(oldEdges) !== JSON.stringify(newEdges) &&
        newEdges.length > 0
      ) {
        this._pageIndex = 0;
        this._data = queryResponse;
      } else {
        break;
      }
    }
  }

  get count(): number | null {
    if (this._data === null) {
      return null;
    }
    return (this._data["count"] as number) ?? null;
  }

  get totalIndex(): number {
    return this._totalIndex;
  }

  get magic(): string {
    const data = JSON.stringify([
      this._queryHash,
      this._queryVariables,
      this._queryReferer,
      this._context.username,
    ]);
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    let hash = 0;
    for (let i = 0; i < dataBytes.length; i++) {
      hash = (hash << 5) - hash + dataBytes[i]!;
      hash |= 0;
    }
    const hashHex = Math.abs(hash).toString(16).padStart(8, "0");
    return btoa(hashHex).replace(/=/g, "").slice(0, 8);
  }

  get firstItem(): T | null {
    if (this._firstNode === null) {
      return null;
    }
    return this._nodeWrapper(this._firstNode);
  }

  static pageLength(): number {
    return NodeIterator._graphqlPageLength;
  }

  freeze(): FrozenNodeIterator {
    let remainingData: JsonNode | null = null;
    if (this._data !== null) {
      const edges = this._data["edges"] as JsonNode[];
      remainingData = {
        ...this._data,
        edges: edges.slice(Math.max(this._pageIndex - 1, 0)),
      };
    }
    return {
      queryHash: this._queryHash,
      queryVariables: this._queryVariables,
      queryReferer: this._queryReferer,
      contextUsername: this._context.username,
      totalIndex: Math.max(this._totalIndex - 1, 0),
      bestBefore: this._bestBefore ? this._bestBefore.getTime() : null,
      remainingData,
      firstNode: this._firstNode,
      docId: this._docId,
    };
  }

  thaw(frozen: FrozenNodeIterator): void {
    if (this._totalIndex || this._pageIndex) {
      throw new InvalidArgumentException(
        "thaw() called on already-used iterator.",
      );
    }
    if (
      this._queryHash !== frozen.queryHash ||
      JSON.stringify(this._queryVariables) !==
        JSON.stringify(frozen.queryVariables) ||
      this._queryReferer !== frozen.queryReferer ||
      this._context.username !== frozen.contextUsername ||
      this._docId !== frozen.docId
    ) {
      throw new InvalidArgumentException("Mismatching resume information.");
    }
    if (!frozen.bestBefore) {
      throw new InvalidArgumentException('"best before" date missing.');
    }
    if (frozen.remainingData === null) {
      throw new InvalidArgumentException('"remaining_data" missing.');
    }
    this._totalIndex = frozen.totalIndex;
    this._bestBefore = new Date(frozen.bestBefore);
    this._data = frozen.remainingData;
    this._initialized = true;
    if (frozen.firstNode !== null) {
      this._firstNode = frozen.firstNode;
    }
  }
}

export interface ResumableIterationResult {
  isResuming: boolean;
  startIndex: number;
}

export async function* resumableIteration<T>(
  context: InstaloaderContext,
  iterator: NodeIterator<T> | AsyncIterable<T>,
  load: (context: InstaloaderContext, path: string) => Promise<FrozenNodeIterator | null>,
  save: (fni: FrozenNodeIterator, path: string) => Promise<void>,
  formatPath: (magic: string) => string,
  options?: {
    checkBbd?: boolean;
    enabled?: boolean;
  },
): AsyncGenerator<{ item: T; isResuming: boolean; startIndex: number }> {
  const { checkBbd = true, enabled = true } = options ?? {};

  if (!enabled || !(iterator instanceof NodeIterator)) {
    for await (const item of iterator) {
      yield { item, isResuming: false, startIndex: 0 };
    }
    return;
  }

  let isResuming = false;
  let startIndex = 0;
  const resumeFilePath = formatPath(iterator.magic);

  try {
    const fni = await load(context, resumeFilePath);
    if (fni !== null) {
      if (
        checkBbd &&
        fni.bestBefore &&
        new Date(fni.bestBefore) < new Date()
      ) {
        context.error(
          `Warning: Not resuming from ${resumeFilePath}: "Best before" date exceeded.`,
        );
      } else {
        try {
          iterator.thaw(fni);
          isResuming = true;
          startIndex = iterator.totalIndex;
          context.log(`Resuming from ${resumeFilePath}.`);
        } catch (exc) {
          context.error(
            `Warning: Not resuming from ${resumeFilePath}: ${exc}`,
          );
        }
      }
    }
  } catch {
  }

  try {
    for await (const item of iterator) {
      yield { item, isResuming, startIndex };
    }
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "AbortDownloadException" || err.message.includes("interrupt"))
    ) {
      const frozen = iterator.freeze();
      await save(frozen, resumeFilePath);
      context.log(`\nSaved resume information to ${resumeFilePath}.`);
    }
    throw err;
  }
}
