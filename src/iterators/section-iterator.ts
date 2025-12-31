import { Effect, Stream, Ref, Option, pipe } from "effect";
import { AbortDownloadError, type InstaloaderErrors } from "../exceptions/index.ts";
import type { InstaloaderContextShape } from "../core/context.ts";
import type { JsonNode } from "../structures/common.ts";

type SectionIteratorError = InstaloaderErrors | AbortDownloadError;

export interface SectionIteratorConfig<T> {
  context: InstaloaderContextShape;
  sectionsExtractor: (data: JsonNode) => JsonNode;
  mediaWrapper: (media: JsonNode) => T;
  queryPath: string;
  firstData: JsonNode | null;
}

interface SectionIteratorState {
  pageIndex: number;
  sectionIndex: number;
  data: JsonNode | null;
  initialized: boolean;
}

const querySection = (
  context: InstaloaderContextShape,
  queryPath: string,
  maxId?: string
): Effect.Effect<JsonNode, SectionIteratorError> =>
  Effect.gen(function* () {
    const params: Record<string, string> = { __a: "1", __d: "dis" };
    if (maxId !== undefined) {
      params["max_id"] = maxId;
    }
    return yield* context.getJson(queryPath, params);
  });

export const createSectionStream = <T>(
  config: SectionIteratorConfig<T>
): Stream.Stream<T, SectionIteratorError> => {
  const { context, sectionsExtractor, mediaWrapper, queryPath, firstData } = config;

  return Stream.unwrap(
    Effect.gen(function* () {
      const stateRef = yield* Ref.make<SectionIteratorState>({
        pageIndex: 0,
        sectionIndex: 0,
        data: firstData ? sectionsExtractor(firstData) : null,
        initialized: firstData !== null,
      });

      const ensureInitialized = Effect.gen(function* () {
        const state = yield* Ref.get(stateRef);
        if (!state.initialized) {
          const result = yield* querySection(context, queryPath);
          const data = sectionsExtractor(result);
          yield* Ref.update(stateRef, (s) => ({
            ...s,
            data,
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

        const sections = state.data["sections"] as JsonNode[];

        while (state.pageIndex < sections.length) {
          const section = sections[state.pageIndex]!;
          const layoutContent = section["layout_content"] as JsonNode;
          const medias = layoutContent["medias"] as JsonNode[];

          if (state.sectionIndex < medias.length) {
            const mediaWrapper_ = medias[state.sectionIndex]!;
            const media = mediaWrapper_["media"] as JsonNode;
            const item = mediaWrapper(media);

            yield* Ref.update(stateRef, (s) => ({
              ...s,
              sectionIndex: s.sectionIndex + 1,
            }));

            return Option.some(item);
          }

          yield* Ref.update(stateRef, (s) => ({
            ...s,
            sectionIndex: 0,
            pageIndex: s.pageIndex + 1,
          }));

          const newState = yield* Ref.get(stateRef);
          if (newState.pageIndex >= sections.length) break;
        }

        const moreAvailable = state.data["more_available"] as boolean;
        if (!moreAvailable) {
          return Option.none<T>();
        }

        const nextMaxId = state.data["next_max_id"] as string;
        const result = yield* querySection(context, queryPath, nextMaxId);
        const newData = sectionsExtractor(result);

        yield* Ref.update(stateRef, () => ({
          pageIndex: 0,
          sectionIndex: 0,
          data: newData,
          initialized: true,
        }));

        const newSections = newData["sections"] as JsonNode[];
        if (newSections.length === 0) {
          return Option.none<T>();
        }

        const section = newSections[0]!;
        const layoutContent = section["layout_content"] as JsonNode;
        const medias = layoutContent["medias"] as JsonNode[];

        if (medias.length === 0) {
          return Option.none<T>();
        }

        const mediaWrapper_ = medias[0]!;
        const media = mediaWrapper_["media"] as JsonNode;
        const item = mediaWrapper(media);

        yield* Ref.update(stateRef, (s) => ({
          ...s,
          sectionIndex: 1,
        }));

        return Option.some(item);
      });

      return Stream.repeatEffectOption(
        pipe(
          getNextItem,
          Effect.map(
            Option.match({
              onNone: () => Effect.fail(Option.none<never>()),
              onSome: (item) => Effect.succeed(item),
            })
          ),
          Effect.flatten,
          Effect.mapError(() => Option.none<never>())
        )
      );
    })
  );
};
