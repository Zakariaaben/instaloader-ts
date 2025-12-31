export interface Ok<A> {
  readonly _tag: "Ok";
  readonly value: A;
  readonly ok: true;
  readonly err: false;
}

export interface Err<E> {
  readonly _tag: "Err";
  readonly error: E;
  readonly ok: false;
  readonly err: true;
}

export type Result<E, A> = Ok<A> | Err<E>;

export const Ok = <A>(value: A): Ok<A> => ({
  _tag: "Ok",
  value,
  ok: true,
  err: false,
});

export const Err = <E>(error: E): Err<E> => ({
  _tag: "Err",
  error,
  ok: false,
  err: true,
});

export const isOk = <E, A>(result: Result<E, A>): result is Ok<A> =>
  result._tag === "Ok";

export const isErr = <E, A>(result: Result<E, A>): result is Err<E> =>
  result._tag === "Err";

export const map = <E, A, B>(
  result: Result<E, A>,
  fn: (a: A) => B
): Result<E, B> =>
  isOk(result) ? Ok(fn(result.value)) : result;

export const mapErr = <E, A, F>(
  result: Result<E, A>,
  fn: (e: E) => F
): Result<F, A> =>
  isErr(result) ? Err(fn(result.error)) : result;

export const flatMap = <E, A, F, B>(
  result: Result<E, A>,
  fn: (a: A) => Result<F, B>
): Result<E | F, B> =>
  isOk(result) ? fn(result.value) : result;

export const unwrap = <E, A>(result: Result<E, A>): A => {
  if (isOk(result)) return result.value;
  throw result.error;
};

export const unwrapOr = <E, A>(result: Result<E, A>, defaultValue: A): A =>
  isOk(result) ? result.value : defaultValue;

export const unwrapErr = <E, A>(result: Result<E, A>): E => {
  if (isErr(result)) return result.error;
  throw new Error("Called unwrapErr on Ok value");
};

export const match = <E, A, B>(
  result: Result<E, A>,
  handlers: { readonly ok: (a: A) => B; readonly err: (e: E) => B }
): B =>
  isOk(result) ? handlers.ok(result.value) : handlers.err(result.error);

export const fromNullable = <A>(
  value: A | null | undefined,
  onNull: () => Error
): Result<Error, A> =>
  value == null ? Err(onNull()) : Ok(value);

export const tryCatch = <A, E = Error>(
  fn: () => A,
  onError: (error: unknown) => E
): Result<E, A> => {
  try {
    return Ok(fn());
  } catch (error) {
    return Err(onError(error));
  }
};

export const tryCatchAsync = async <A, E = Error>(
  fn: () => Promise<A>,
  onError: (error: unknown) => E
): Promise<Result<E, A>> => {
  try {
    return Ok(await fn());
  } catch (error) {
    return Err(onError(error));
  }
};

export const all = <E, A>(results: Result<E, A>[]): Result<E, A[]> => {
  const values: A[] = [];
  for (const result of results) {
    if (isErr(result)) return result;
    values.push(result.value);
  }
  return Ok(values);
};

export const any = <E, A>(results: Result<E, A>[]): Result<E[], A> => {
  const errors: E[] = [];
  for (const result of results) {
    if (isOk(result)) return result;
    errors.push(result.error);
  }
  return Err(errors);
};
