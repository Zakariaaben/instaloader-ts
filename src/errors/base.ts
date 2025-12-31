/**
 * Base Error Classes for Instaloader - Public API
 * @module
 */

export type ErrorTag =
  | "InstaloaderError"
  | "QueryReturnedBadRequestError"
  | "QueryReturnedForbiddenError"
  | "QueryReturnedNotFoundError"
  | "ProfileNotExistsError"
  | "ProfileHasNoPicsError"
  | "PrivateProfileNotFollowedError"
  | "LoginRequiredError"
  | "LoginError"
  | "TwoFactorAuthRequiredError"
  | "BadCredentialsError"
  | "ConnectionError"
  | "TooManyRequestsError"
  | "InvalidArgumentError"
  | "BadResponseError"
  | "PostChangedError"
  | "IPhoneSupportDisabledError"
  | "AbortDownloadError";

export abstract class InstaloaderBaseError extends Error {
  abstract readonly _tag: ErrorTag;
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = this.constructor.name;
  }

  override toString(): string {
    return `${this._tag}: ${this.message}`;
  }

  toJSON(): Record<string, unknown> {
    return {
      _tag: this._tag,
      name: this.name,
      message: this.message,
      cause: this.cause,
      stack: this.stack,
    };
  }
}

export class InstaloaderError extends InstaloaderBaseError {
  readonly _tag = "InstaloaderError" as const;

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}
