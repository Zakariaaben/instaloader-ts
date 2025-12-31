import { InstaloaderBaseError } from "./base.ts";

export class ProfileNotExistsError extends InstaloaderBaseError {
  readonly _tag = "ProfileNotExistsError" as const;
  readonly username?: string;

  constructor(message: string, options?: { username?: string; cause?: unknown }) {
    super(message, options?.cause);
    this.username = options?.username;
  }
}

export class ProfileHasNoPicsError extends InstaloaderBaseError {
  readonly _tag = "ProfileHasNoPicsError" as const;

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class PrivateProfileNotFollowedError extends InstaloaderBaseError {
  readonly _tag = "PrivateProfileNotFollowedError" as const;
  readonly username?: string;

  constructor(message: string, options?: { username?: string; cause?: unknown }) {
    super(message, options?.cause);
    this.username = options?.username;
  }
}

export type ProfileError =
  | ProfileNotExistsError
  | ProfileHasNoPicsError
  | PrivateProfileNotFollowedError;
