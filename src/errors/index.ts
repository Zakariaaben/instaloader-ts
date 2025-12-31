export { InstaloaderBaseError, InstaloaderError, type ErrorTag } from "./base.ts";

export {
  QueryReturnedBadRequestError,
  QueryReturnedForbiddenError,
  QueryReturnedNotFoundError,
  type QueryError,
} from "./query.ts";

export {
  ProfileNotExistsError,
  ProfileHasNoPicsError,
  PrivateProfileNotFollowedError,
  type ProfileError,
} from "./profile.ts";

export {
  LoginRequiredError,
  LoginError,
  TwoFactorAuthRequiredError,
  BadCredentialsError,
  type AuthenticationError,
} from "./auth.ts";

export {
  ConnectionError,
  TooManyRequestsError,
  type ConnectionErrors,
} from "./connection.ts";

export {
  InvalidArgumentError,
  BadResponseError,
  PostChangedError,
  type ResponseError,
} from "./response.ts";

export {
  IPhoneSupportDisabledError,
  AbortDownloadError,
  type FeatureError,
} from "./feature.ts";

import { InstaloaderBaseError } from "./base.ts";
import type { QueryError } from "./query.ts";
import type { ProfileError } from "./profile.ts";
import type { AuthenticationError } from "./auth.ts";
import type { ConnectionErrors } from "./connection.ts";
import type { ResponseError } from "./response.ts";
import type { FeatureError } from "./feature.ts";

import {
  QueryReturnedBadRequestError,
  QueryReturnedForbiddenError,
  QueryReturnedNotFoundError,
} from "./query.ts";
import {
  ProfileNotExistsError,
  PrivateProfileNotFollowedError,
} from "./profile.ts";
import {
  LoginRequiredError,
  LoginError,
  TwoFactorAuthRequiredError,
  BadCredentialsError,
} from "./auth.ts";
import { ConnectionError, TooManyRequestsError } from "./connection.ts";
import { AbortDownloadError } from "./feature.ts";

export type InstaloaderErrors =
  | QueryError
  | ProfileError
  | AuthenticationError
  | ConnectionErrors
  | ResponseError
  | FeatureError;

export type AllContextErrors =
  | InstaloaderErrors
  | AbortDownloadError;

export const isInstaloaderError = (error: unknown): error is InstaloaderErrors =>
  error instanceof InstaloaderBaseError;

export const isAuthenticationError = (error: unknown): error is AuthenticationError =>
  error instanceof LoginRequiredError ||
  error instanceof LoginError ||
  error instanceof TwoFactorAuthRequiredError ||
  error instanceof BadCredentialsError;

export const isConnectionError = (error: unknown): error is ConnectionErrors =>
  error instanceof ConnectionError ||
  error instanceof TooManyRequestsError;

export const isQueryError = (error: unknown): error is QueryError =>
  error instanceof QueryReturnedBadRequestError ||
  error instanceof QueryReturnedForbiddenError ||
  error instanceof QueryReturnedNotFoundError;

export const isProfileError = (error: unknown): error is ProfileError =>
  error instanceof ProfileNotExistsError ||
  error instanceof PrivateProfileNotFollowedError;

export const isAbortDownloadError = (error: unknown): error is AbortDownloadError =>
  error instanceof AbortDownloadError;
