import { InstaloaderBaseError } from "./base.ts";

export class InvalidArgumentError extends InstaloaderBaseError {
  readonly _tag = "InvalidArgumentError" as const;
  readonly argument?: string;

  constructor(message: string, options?: { argument?: string; cause?: unknown }) {
    super(message, options?.cause);
    this.argument = options?.argument;
  }
}

export class BadResponseError extends InstaloaderBaseError {
  readonly _tag = "BadResponseError" as const;
  readonly response?: unknown;

  constructor(message: string, options?: { response?: unknown; cause?: unknown }) {
    super(message, options?.cause);
    this.response = options?.response;
  }
}

export class PostChangedError extends InstaloaderBaseError {
  readonly _tag = "PostChangedError" as const;
  readonly shortcode?: string;

  constructor(message: string, options?: { shortcode?: string; cause?: unknown }) {
    super(message, options?.cause);
    this.shortcode = options?.shortcode;
  }
}

export type ResponseError = InvalidArgumentError | BadResponseError | PostChangedError;
