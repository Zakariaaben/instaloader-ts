import { Effect, Stream } from "effect";
import type { Result } from "./result";
import { Ok, Err } from "./result";

export interface TypedAsyncIterable<E, A> {
  [Symbol.asyncIterator](): AsyncIterator<Result<E, A>>;
  collect(): Promise<Result<E, A[]>>;
  take(n: number): Promise<Result<E, A[]>>;
  forEach(fn: (item: A) => void | Promise<void>): Promise<Result<E, void>>;
  map<B>(fn: (item: A) => B): TypedAsyncIterable<E, B>;
  filter(fn: (item: A) => boolean): TypedAsyncIterable<E, A>;
  flatMap<F, B>(fn: (item: A) => TypedAsyncIterable<F, B>): TypedAsyncIterable<E | F, B>;
  mapAsync<B>(fn: (item: A) => Promise<B>): TypedAsyncIterable<E | Error, B>;
  first(): Promise<Result<E, A | undefined>>;
  count(): Promise<Result<E, number>>;
}

export class TypedAsyncIterableImpl<E, A> implements TypedAsyncIterable<E, A> {
  constructor(
    private readonly streamEffect: Effect.Effect<Stream.Stream<A, E>>
  ) {}

  async *[Symbol.asyncIterator](): AsyncGenerator<Result<E, A>, void, undefined> {
    const streamEffect = this.streamEffect;
    
    const collectAll = Effect.gen(function* () {
      const stream = yield* streamEffect;
      const items = yield* Stream.runCollect(stream);
      return [...items];
    });

    try {
      const items = await Effect.runPromise(collectAll);
      for (const item of items) {
        yield Ok(item);
      }
    } catch (error) {
      yield Err(error as E);
    }
  }

  async collect(): Promise<Result<E, A[]>> {
    const items: A[] = [];
    for await (const result of this) {
      if (result.err) return result;
      items.push(result.value);
    }
    return Ok(items);
  }

  async take(n: number): Promise<Result<E, A[]>> {
    const items: A[] = [];
    let count = 0;
    for await (const result of this) {
      if (result.err) return result;
      items.push(result.value);
      count++;
      if (count >= n) break;
    }
    return Ok(items);
  }

  async forEach(fn: (item: A) => void | Promise<void>): Promise<Result<E, void>> {
    for await (const result of this) {
      if (result.err) return result;
      await fn(result.value);
    }
    return Ok(undefined);
  }

  async first(): Promise<Result<E, A | undefined>> {
    for await (const result of this) {
      if (result.err) return result;
      return Ok(result.value);
    }
    return Ok(undefined);
  }

  async count(): Promise<Result<E, number>> {
    let count = 0;
    for await (const result of this) {
      if (result.err) return result;
      count++;
    }
    return Ok(count);
  }

  map<B>(fn: (item: A) => B): TypedAsyncIterable<E, B> {
    return new TypedAsyncIterableImpl(
      Effect.map(this.streamEffect, (stream) => Stream.map(stream, fn))
    );
  }

  filter(fn: (item: A) => boolean): TypedAsyncIterable<E, A> {
    return new TypedAsyncIterableImpl(
      Effect.map(this.streamEffect, (stream) => Stream.filter(stream, fn))
    );
  }

  flatMap<F, B>(fn: (item: A) => TypedAsyncIterable<F, B>): TypedAsyncIterable<E | F, B> {
    const self = this;

    async function* generator(): AsyncGenerator<Result<E | F, B>, void, undefined> {
      for await (const outerResult of self) {
        if (outerResult.err) {
          yield outerResult;
          return;
        }

        const innerIterable = fn(outerResult.value);
        for await (const innerResult of innerIterable) {
          yield innerResult;
          if (innerResult.err) return;
        }
      }
    }

    return fromAsyncGenerator(generator);
  }

  mapAsync<B>(fn: (item: A) => Promise<B>): TypedAsyncIterable<E | Error, B> {
    return new TypedAsyncIterableImpl(
      Effect.map(this.streamEffect, (stream) =>
        Stream.mapEffect(stream, (item) =>
          Effect.tryPromise({
            try: () => fn(item),
            catch: (error) =>
              error instanceof Error ? error : new Error(String(error)),
          })
        )
      )
    );
  }
}

export function fromStreamEffect<E, A>(
  streamEffect: Effect.Effect<Stream.Stream<A, E>>
): TypedAsyncIterable<E, A> {
  return new TypedAsyncIterableImpl(streamEffect);
}

export function fromStream<E, A>(
  stream: Stream.Stream<A, E>
): TypedAsyncIterable<E, A> {
  return new TypedAsyncIterableImpl(Effect.succeed(stream));
}

export function empty<E = never, A = never>(): TypedAsyncIterable<E, A> {
  return new TypedAsyncIterableImpl(Effect.succeed(Stream.empty));
}

export function fromArray<A>(items: A[]): TypedAsyncIterable<never, A> {
  return new TypedAsyncIterableImpl(Effect.succeed(Stream.fromIterable(items)));
}

export function fromAsyncGenerator<E, A>(
  generator: () => AsyncGenerator<Result<E, A>, void, undefined>
): TypedAsyncIterable<E, A> {
  const iterable: TypedAsyncIterable<E, A> = {
    [Symbol.asyncIterator]: generator,

    async collect(): Promise<Result<E, A[]>> {
      const items: A[] = [];
      for await (const result of iterable) {
        if (result.err) return result;
        items.push(result.value);
      }
      return Ok(items);
    },

    async take(n: number): Promise<Result<E, A[]>> {
      const items: A[] = [];
      let count = 0;
      for await (const result of iterable) {
        if (result.err) return result;
        items.push(result.value);
        count++;
        if (count >= n) break;
      }
      return Ok(items);
    },

    async forEach(fn: (item: A) => void | Promise<void>): Promise<Result<E, void>> {
      for await (const result of iterable) {
        if (result.err) return result;
        await fn(result.value);
      }
      return Ok(undefined);
    },

    async first(): Promise<Result<E, A | undefined>> {
      for await (const result of iterable) {
        if (result.err) return result;
        return Ok(result.value);
      }
      return Ok(undefined);
    },

    async count(): Promise<Result<E, number>> {
      let count = 0;
      for await (const result of iterable) {
        if (result.err) return result;
        count++;
      }
      return Ok(count);
    },

    map<B>(fn: (item: A) => B): TypedAsyncIterable<E, B> {
      async function* mapped(): AsyncGenerator<Result<E, B>, void, undefined> {
        for await (const result of iterable) {
          if (result.err) {
            yield result;
            return;
          }
          yield Ok(fn(result.value));
        }
      }
      return fromAsyncGenerator(mapped);
    },

    filter(fn: (item: A) => boolean): TypedAsyncIterable<E, A> {
      async function* filtered(): AsyncGenerator<Result<E, A>, void, undefined> {
        for await (const result of iterable) {
          if (result.err) {
            yield result;
            return;
          }
          if (fn(result.value)) {
            yield result;
          }
        }
      }
      return fromAsyncGenerator(filtered);
    },

    flatMap<F, B>(fn: (item: A) => TypedAsyncIterable<F, B>): TypedAsyncIterable<E | F, B> {
      async function* flatMapped(): AsyncGenerator<Result<E | F, B>, void, undefined> {
        for await (const outerResult of iterable) {
          if (outerResult.err) {
            yield outerResult;
            return;
          }

          const innerIterable = fn(outerResult.value);
          for await (const innerResult of innerIterable) {
            yield innerResult;
            if (innerResult.err) return;
          }
        }
      }
      return fromAsyncGenerator(flatMapped);
    },

    mapAsync<B>(fn: (item: A) => Promise<B>): TypedAsyncIterable<E | Error, B> {
      async function* mapped(): AsyncGenerator<Result<E | Error, B>, void, undefined> {
        for await (const result of iterable) {
          if (result.err) {
            yield result;
            return;
          }
          try {
            yield Ok(await fn(result.value));
          } catch (error) {
            yield Err(error instanceof Error ? error : new Error(String(error)));
            return;
          }
        }
      }
      return fromAsyncGenerator(mapped);
    },
  };

  return iterable;
}

export function merge<E, A>(
  iterables: TypedAsyncIterable<E, A>[]
): TypedAsyncIterable<E, A> {
  async function* merged(): AsyncGenerator<Result<E, A>, void, undefined> {
    for (const iterable of iterables) {
      for await (const result of iterable) {
        yield result;
        if (result.err) return;
      }
    }
  }

  return fromAsyncGenerator(merged);
}

export function concat<E, A>(
  iterables: TypedAsyncIterable<E, A>[]
): TypedAsyncIterable<E, A> {
  async function* concatenated(): AsyncGenerator<Result<E, A>, void, undefined> {
    for (const iterable of iterables) {
      for await (const result of iterable) {
        yield result;
        if (result.err) return;
      }
    }
  }

  return fromAsyncGenerator(concatenated);
}
