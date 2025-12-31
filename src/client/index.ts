export { Instaloader } from "./instaloader";

export type { Result } from "./result";
export {
  Ok,
  Err,
  isOk,
  isErr,
  map,
  mapErr,
  flatMap,
  unwrap,
  unwrapOr,
  unwrapErr,
  match,
  fromNullable,
  tryCatch,
  tryCatchAsync,
  all,
  any,
} from "./result";

export type { Option } from "./option";
export {
  Some,
  None,
  isSome,
  isNone,
  fromNullable as optionFromNullable,
  getOrElse,
  getOrElseLazy,
  map as mapOption,
  flatMap as flatMapOption,
  filter as filterOption,
  match as matchOption,
  toNullable,
  toUndefined,
  zip,
  all as allOptions,
} from "./option";

export type { TypedAsyncIterable } from "./async-iterable";
export {
  fromStreamEffect,
  fromStream,
  fromArray,
  fromAsyncGenerator,
  empty,
  merge,
  concat,
} from "./async-iterable";

export type {
  InstaloaderOptions,
  Profile,
  Post,
  PostError,
  SidecarNode,
  Story,
  Highlight,
  Hashtag,
} from "./types";
