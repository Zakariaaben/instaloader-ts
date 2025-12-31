import { InstaloaderBaseError } from "./base.ts";

export class QueryReturnedBadRequestError extends InstaloaderBaseError {
  readonly _tag = "QueryReturnedBadRequestError" as const;

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class QueryReturnedForbiddenError extends InstaloaderBaseError {
  readonly _tag = "QueryReturnedForbiddenError" as const;

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class QueryReturnedNotFoundError extends InstaloaderBaseError {
  readonly _tag = "QueryReturnedNotFoundError" as const;

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export type QueryError =
  | QueryReturnedBadRequestError
  | QueryReturnedForbiddenError
  | QueryReturnedNotFoundError;
