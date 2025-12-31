import { InstaloaderBaseError } from "./base.ts";

export class IPhoneSupportDisabledError extends InstaloaderBaseError {
  readonly _tag = "IPhoneSupportDisabledError" as const;

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class AbortDownloadError extends InstaloaderBaseError {
  readonly _tag = "AbortDownloadError" as const;

  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export type FeatureError = IPhoneSupportDisabledError | AbortDownloadError;
