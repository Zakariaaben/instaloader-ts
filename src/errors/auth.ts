import { InstaloaderBaseError } from "./base.ts";

export class LoginRequiredError extends InstaloaderBaseError {
  readonly _tag = "LoginRequiredError" as const;

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class LoginError extends InstaloaderBaseError {
  readonly _tag = "LoginError" as const;

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class TwoFactorAuthRequiredError extends InstaloaderBaseError {
  readonly _tag = "TwoFactorAuthRequiredError" as const;
  readonly twoFactorIdentifier?: string;

  constructor(message: string, options?: { twoFactorIdentifier?: string; cause?: unknown }) {
    super(message, options?.cause);
    this.twoFactorIdentifier = options?.twoFactorIdentifier;
  }
}

export class BadCredentialsError extends InstaloaderBaseError {
  readonly _tag = "BadCredentialsError" as const;

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export type AuthenticationError =
  | LoginRequiredError
  | LoginError
  | TwoFactorAuthRequiredError
  | BadCredentialsError;
