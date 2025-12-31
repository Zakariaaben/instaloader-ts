export interface Some<A> {
  readonly _tag: "Some";
  readonly value: A;
  readonly some: true;
  readonly none: false;
}

export interface None {
  readonly _tag: "None";
  readonly some: false;
  readonly none: true;
}

export type Option<A> = Some<A> | None;

export const Some = <A>(value: A): Some<A> => ({
  _tag: "Some",
  value,
  some: true,
  none: false,
});

export const None: None = {
  _tag: "None",
  some: false,
  none: true,
};

export const isSome = <A>(option: Option<A>): option is Some<A> =>
  option._tag === "Some";

export const isNone = <A>(option: Option<A>): option is None =>
  option._tag === "None";

export const fromNullable = <A>(value: A | null | undefined): Option<A> =>
  value == null ? None : Some(value);

export const getOrElse = <A>(option: Option<A>, defaultValue: A): A =>
  isSome(option) ? option.value : defaultValue;

export const getOrElseLazy = <A>(option: Option<A>, getDefault: () => A): A =>
  isSome(option) ? option.value : getDefault();

export const map = <A, B>(option: Option<A>, fn: (a: A) => B): Option<B> =>
  isSome(option) ? Some(fn(option.value)) : None;

export const flatMap = <A, B>(
  option: Option<A>,
  fn: (a: A) => Option<B>
): Option<B> =>
  isSome(option) ? fn(option.value) : None;

export const filter = <A>(
  option: Option<A>,
  predicate: (a: A) => boolean
): Option<A> =>
  isSome(option) && predicate(option.value) ? option : None;

export const match = <A, B>(
  option: Option<A>,
  handlers: { readonly some: (a: A) => B; readonly none: () => B }
): B =>
  isSome(option) ? handlers.some(option.value) : handlers.none();

export const toNullable = <A>(option: Option<A>): A | null =>
  isSome(option) ? option.value : null;

export const toUndefined = <A>(option: Option<A>): A | undefined =>
  isSome(option) ? option.value : undefined;

export const zip = <A, B>(a: Option<A>, b: Option<B>): Option<readonly [A, B]> =>
  isSome(a) && isSome(b) ? Some([a.value, b.value] as const) : None;

export const all = <A>(options: Option<A>[]): Option<A[]> => {
  const values: A[] = [];
  for (const option of options) {
    if (isNone(option)) return None;
    values.push(option.value);
  }
  return Some(values);
};
