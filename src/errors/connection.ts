import { InstaloaderBaseError } from "./base.ts";

export class ConnectionError extends InstaloaderBaseError {
  readonly _tag = "ConnectionError" as const;

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class TooManyRequestsError extends InstaloaderBaseError {
  readonly _tag = "TooManyRequestsError" as const;
  readonly retryAfter?: number;

  constructor(message: string, options?: { retryAfter?: number; cause?: unknown }) {
    super(message, options?.cause);
    this.retryAfter = options?.retryAfter;
  }
}

export type ConnectionErrors = ConnectionError | TooManyRequestsError;
