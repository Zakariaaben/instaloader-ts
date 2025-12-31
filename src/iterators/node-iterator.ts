import { Effect, Stream, Ref, Option, pipe } from "effect";
import { AbortDownloadError, InvalidArgumentError, type InstaloaderErrors } from "../exceptions/index.ts";
import type { JsonNode } from "../structures/common.ts";
import type { InstaloaderContextShape } from "../core/context.ts";

export type NodeIteratorError = InstaloaderErrors | AbortDownloadError;

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

interface NodeIteratorState {
  pageIndex: number;
  totalIndex: number;
  data: JsonNode | null;
  bestBefore: Date | null;
  firstNode: JsonNode | null;
  initialized: boolean;
}

const GRAPHQL_PAGE_LENGTH = 12;
const SHELF_LIFE_MS = 29 * 24 * 60 * 60 * 1000;

export interface NodeIteratorConfig<T> {
  context: InstaloaderContextShape;
  queryHash: string | null;
  docId: string | null;
  edgeExtractor: (data: JsonNode) => JsonNode;
  nodeWrapper: (node: JsonNode) => T;
  queryVariables: Record<string, unknown>;
  queryReferer: string | null;
  firstData: JsonNode | null;
  isFirst: ((item: T, firstItem: T | null) => boolean) | null;
}

const queryDocId = (
  context: InstaloaderContextShape,
  docId: string,
  variables: Record<string, unknown>,
  referer: string | null,
  after?: string
): Effect.Effect<JsonNode, NodeIteratorError> =>
  Effect.gen(function* () {
    const paginationVariables: Record<string, unknown> = {
      __relay_internal__pv__PolarisFeedShareMenurelayprovider: false,
    };
    if (after !== undefined) {
      paginationVariables["after"] = after;
      paginationVariables["before"] = null;
      paginationVariables["first"] = 12;
      paginationVariables["last"] = null;
    }
    
    const result = yield* context.docIdGraphqlQuery(
      docId,
      { ...variables, ...paginationVariables },
      referer ?? undefined
    );
    
    return result as JsonNode;
  });

const queryQueryHash = (
  context: InstaloaderContextShape,
  queryHash: string,
  variables: Record<string, unknown>,
  referer: string | null,
  after?: string
): Effect.Effect<JsonNode, NodeIteratorError> =>
  Effect.gen(function* () {
    const paginationVariables: Record<string, unknown> = {
      first: GRAPHQL_PAGE_LENGTH,
    };
    if (after !== undefined) {
      paginationVariables["after"] = after;
    }
    
    const result = yield* context.graphqlQuery(
      queryHash,
      { ...variables, ...paginationVariables },
      referer ?? undefined
    );
    
    return result as JsonNode;
  });

const executeQuery = (
  context: InstaloaderContextShape,
  queryHash: string | null,
  docId: string | null,
  variables: Record<string, unknown>,
  referer: string | null,
  edgeExtractor: (data: JsonNode) => JsonNode,
  after?: string
): Effect.Effect<JsonNode, NodeIteratorError | InvalidArgumentError> =>
  Effect.gen(function* () {
    let result: JsonNode;
    
    if (docId !== null) {
      result = yield* queryDocId(context, docId, variables, referer, after);
    } else if (queryHash !== null) {
      result = yield* queryQueryHash(context, queryHash, variables, referer, after);
    } else {
      return yield* Effect.fail(
        new InvalidArgumentError({ 
          message: "Either queryHash or docId must be provided" 
        })
      );
    }
    
    return edgeExtractor(result);
  });

export const createNodeStream = <T>(
  config: NodeIteratorConfig<T>
): Stream.Stream<T, NodeIteratorError | InvalidArgumentError> => {
  const {
    context,
    queryHash,
    docId,
    edgeExtractor,
    nodeWrapper,
    queryVariables,
    queryReferer,
    firstData,
    isFirst,
  } = config;

  return Stream.unwrap(
    Effect.gen(function* () {
      const stateRef = yield* Ref.make<NodeIteratorState>({
        pageIndex: 0,
        totalIndex: 0,
        data: firstData,
        bestBefore: firstData ? new Date(Date.now() + SHELF_LIFE_MS) : null,
        firstNode: null,
        initialized: firstData !== null,
      });

      const ensureInitialized = Effect.gen(function* () {
        const state = yield* Ref.get(stateRef);
        if (!state.initialized) {
          const data = yield* executeQuery(
            context,
            queryHash,
            docId,
            queryVariables,
            queryReferer,
            edgeExtractor
          );
          yield* Ref.update(stateRef, (s) => ({
            ...s,
            data,
            bestBefore: new Date(Date.now() + SHELF_LIFE_MS),
            initialized: true,
          }));
        }
      });

      const getNextItem = Effect.gen(function* () {
        yield* ensureInitialized;
        const state = yield* Ref.get(stateRef);
        
        if (state.data === null) {
          return Option.none<T>();
        }

        const edges = state.data["edges"] as JsonNode[];
        
        // Check if we have items in current page
        if (state.pageIndex < edges.length) {
          const edge = edges[state.pageIndex]!;
          const node = edge["node"] as JsonNode;
          const item = nodeWrapper(node);

          // Track first node
          let newFirstNode = state.firstNode;
          if (isFirst !== null) {
            const currentFirst = state.firstNode ? nodeWrapper(state.firstNode) : null;
            if (isFirst(item, currentFirst)) {
              newFirstNode = node;
            }
          } else if (state.firstNode === null) {
            newFirstNode = node;
          }

          yield* Ref.update(stateRef, (s) => ({
            ...s,
            pageIndex: s.pageIndex + 1,
            totalIndex: s.totalIndex + 1,
            firstNode: newFirstNode,
          }));

          return Option.some(item);
        }

        // Check for next page
        const pageInfo = state.data["page_info"] as JsonNode | undefined;
        const hasNextPage = pageInfo?.["has_next_page"] as boolean | undefined;

        if (!hasNextPage) {
          return Option.none<T>();
        }

        // Fetch next page
        const endCursor = pageInfo!["end_cursor"] as string;
        const newData = yield* executeQuery(
          context,
          queryHash,
          docId,
          queryVariables,
          queryReferer,
          edgeExtractor,
          endCursor
        );

        const newEdges = newData["edges"] as JsonNode[];
        
        // Check if we got new data
        if (
          JSON.stringify(edges) === JSON.stringify(newEdges) ||
          newEdges.length === 0
        ) {
          return Option.none<T>();
        }

        // Reset page index and get first item from new page
        const firstEdge = newEdges[0]!;
        const firstNode = firstEdge["node"] as JsonNode;
        const item = nodeWrapper(firstNode);

        let newFirstNode = state.firstNode;
        if (isFirst !== null) {
          const currentFirst = state.firstNode ? nodeWrapper(state.firstNode) : null;
          if (isFirst(item, currentFirst)) {
            newFirstNode = firstNode;
          }
        } else if (state.firstNode === null) {
          newFirstNode = firstNode;
        }

        yield* Ref.update(stateRef, (s) => ({
          ...s,
          pageIndex: 1,
          totalIndex: s.totalIndex + 1,
          data: newData,
          firstNode: newFirstNode,
        }));

        return Option.some(item);
      });

      return Stream.repeatEffectOption(
        pipe(
          getNextItem,
          Effect.map(Option.match({
            onNone: () => Effect.fail(Option.none<never>()),
            onSome: (item) => Effect.succeed(item),
          })),
          Effect.flatten,
          Effect.mapError(() => Option.none<never>())
        )
      );
    })
  );
};

export const computeMagic = (
  queryHash: string | null,
  queryVariables: Record<string, unknown>,
  queryReferer: string | null,
  username: string | null
): string => {
  const data = JSON.stringify([queryHash, queryVariables, queryReferer, username]);
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  let hash = 0;
  for (let i = 0; i < dataBytes.length; i++) {
    hash = (hash << 5) - hash + dataBytes[i]!;
    hash |= 0;
  }
  const hashHex = Math.abs(hash).toString(16).padStart(8, "0");
  return btoa(hashHex).replace(/=/g, "").slice(0, 8);
};

export const pageLength = (): number => GRAPHQL_PAGE_LENGTH;

export interface ResumableIterationResult<T> {
  item: T;
  isResuming: boolean;
  startIndex: number;
}

export const resumableIterationStream = <T>(
  context: InstaloaderContextShape,
  stream: Stream.Stream<T, NodeIteratorError | InvalidArgumentError>,
  load: (path: string) => Effect.Effect<FrozenNodeIterator | null, never>,
  _save: (fni: FrozenNodeIterator, path: string) => Effect.Effect<void, never>,
  formatPath: (magic: string) => string,
  magic: string,
  options?: {
    checkBbd?: boolean;
    enabled?: boolean;
  }
): Stream.Stream<ResumableIterationResult<T>, NodeIteratorError | InvalidArgumentError> => {
  const { checkBbd = true, enabled = true } = options ?? {};

  if (!enabled) {
    return pipe(
      stream,
      Stream.map((item) => ({ item, isResuming: false, startIndex: 0 }))
    );
  }

  return Stream.unwrap(
    Effect.gen(function* () {
      const resumeFilePath = formatPath(magic);
      const fni = yield* load(resumeFilePath);

      let isResuming = false;
      let startIndex = 0;

      if (fni !== null) {
        if (checkBbd && fni.bestBefore && new Date(fni.bestBefore) < new Date()) {
          yield* context.error(
            `Warning: Not resuming from ${resumeFilePath}: "Best before" date exceeded.`
          );
        } else {
          isResuming = true;
          startIndex = fni.totalIndex;
          yield* context.log(`Resuming from ${resumeFilePath}.`);
        }
      }

      return pipe(
        stream,
        Stream.map((item) => ({ item, isResuming, startIndex }))
      );
    })
  );
};
