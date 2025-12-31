/**
 * Instaloader Exceptions
 *
 * Custom error types for handling various error conditions
 * during Instagram data retrieval and processing.
 *
 * Uses Effect.ts Data.TaggedError for type-safe, yieldable errors.
 */

import { Data } from "effect";

// ============================================================================
// Base Errors
// ============================================================================

/**
 * Base error for instaloader-ts.
 * Most errors extend from this base type.
 */
export class InstaloaderError extends Data.TaggedError("InstaloaderError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// ============================================================================
// Query/HTTP Errors
// ============================================================================

/**
 * Raised when Instagram returns HTTP 400 Bad Request.
 */
export class QueryReturnedBadRequestError extends Data.TaggedError(
  "QueryReturnedBadRequestError",
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Raised when Instagram returns HTTP 403 Forbidden.
 */
export class QueryReturnedForbiddenError extends Data.TaggedError(
  "QueryReturnedForbiddenError",
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Raised when Instagram returns HTTP 404 Not Found.
 */
export class QueryReturnedNotFoundError extends Data.TaggedError(
  "QueryReturnedNotFoundError",
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// ============================================================================
// Profile Errors
// ============================================================================

/**
 * Raised when the requested profile does not exist.
 */
export class ProfileNotExistsError extends Data.TaggedError(
  "ProfileNotExistsError",
)<{
  readonly message: string;
  readonly username?: string;
  readonly cause?: unknown;
}> {}

/**
 * @deprecated Since 4.2.2 - Not raised anymore.
 * Raised when profile has no pictures.
 */
export class ProfileHasNoPicsError extends Data.TaggedError(
  "ProfileHasNoPicsError",
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Raised when trying to access a private profile that is not followed.
 */
export class PrivateProfileNotFollowedError extends Data.TaggedError(
  "PrivateProfileNotFollowedError",
)<{
  readonly message: string;
  readonly username?: string;
  readonly cause?: unknown;
}> {}

// ============================================================================
// Authentication Errors
// ============================================================================

/**
 * Raised when login is required to access the requested resource.
 */
export class LoginRequiredError extends Data.TaggedError("LoginRequiredError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Raised when login fails.
 */
export class LoginError extends Data.TaggedError("LoginError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Raised when two-factor authentication is required during login.
 */
export class TwoFactorAuthRequiredError extends Data.TaggedError(
  "TwoFactorAuthRequiredError",
)<{
  readonly message: string;
  readonly twoFactorIdentifier?: string;
  readonly cause?: unknown;
}> {}

/**
 * Raised when login credentials are incorrect.
 */
export class BadCredentialsError extends Data.TaggedError(
  "BadCredentialsError",
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// ============================================================================
// Connection Errors
// ============================================================================

/**
 * Raised when a connection error occurs.
 */
export class ConnectionError extends Data.TaggedError("ConnectionError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Raised when Instagram returns HTTP 429 Too Many Requests.
 */
export class TooManyRequestsError extends Data.TaggedError(
  "TooManyRequestsError",
)<{
  readonly message: string;
  readonly retryAfter?: number;
  readonly cause?: unknown;
}> {}

// ============================================================================
// Response/Data Errors
// ============================================================================

/**
 * Raised when an invalid argument is passed.
 */
export class InvalidArgumentError extends Data.TaggedError(
  "InvalidArgumentError",
)<{
  readonly message: string;
  readonly argument?: string;
  readonly cause?: unknown;
}> {}

/**
 * Raised when Instagram returns an unexpected or malformed response.
 */
export class BadResponseError extends Data.TaggedError("BadResponseError")<{
  readonly message: string;
  readonly response?: unknown;
  readonly cause?: unknown;
}> {}

/**
 * Raised when a post has changed since it was loaded.
 * @since 4.2.2
 */
export class PostChangedError extends Data.TaggedError("PostChangedError")<{
  readonly message: string;
  readonly shortcode?: string;
  readonly cause?: unknown;
}> {}

// ============================================================================
// Feature Errors
// ============================================================================

/**
 * Raised when iPhone support is disabled but required.
 */
export class IPhoneSupportDisabledError extends Data.TaggedError(
  "IPhoneSupportDisabledError",
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// ============================================================================
// Control Flow Errors (Not Instaloader-specific)
// ============================================================================

/**
 * Error that aborts the download loop.
 *
 * This error is intentionally separate from InstaloaderError and should
 * NOT be caught by general error handlers inside the download loop,
 * allowing for immediate termination.
 *
 * @since 4.7
 */
export class AbortDownloadError extends Data.TaggedError("AbortDownloadError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// ============================================================================
// Union Types for Error Handling
// ============================================================================

/**
 * Union of all Instaloader-specific errors.
 * Useful for exhaustive pattern matching.
 */
export type InstaloaderErrors =
  | InstaloaderError
  | QueryReturnedBadRequestError
  | QueryReturnedForbiddenError
  | QueryReturnedNotFoundError
  | ProfileNotExistsError
  | ProfileHasNoPicsError
  | PrivateProfileNotFollowedError
  | LoginRequiredError
  | LoginError
  | TwoFactorAuthRequiredError
  | BadCredentialsError
  | ConnectionError
  | TooManyRequestsError
  | InvalidArgumentError
  | BadResponseError
  | PostChangedError
  | IPhoneSupportDisabledError;

/**
 * Union of all authentication-related errors.
 */
export type AuthenticationErrors =
  | LoginRequiredError
  | LoginError
  | TwoFactorAuthRequiredError
  | BadCredentialsError;

/**
 * Union of all connection-related errors.
 */
export type ConnectionErrors =
  | ConnectionError
  | TooManyRequestsError
  | QueryReturnedNotFoundError;

/**
 * Union of all HTTP query errors.
 */
export type QueryErrors =
  | QueryReturnedBadRequestError
  | QueryReturnedForbiddenError
  | QueryReturnedNotFoundError;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if an error is an InstaloaderError.
 */
export function isInstaloaderError(
  error: unknown,
): error is InstaloaderErrors {
  if (error === null || typeof error !== "object") return false;
  const tag = (error as { _tag?: string })._tag;
  return (
    tag === "InstaloaderError" ||
    tag === "QueryReturnedBadRequestError" ||
    tag === "QueryReturnedForbiddenError" ||
    tag === "QueryReturnedNotFoundError" ||
    tag === "ProfileNotExistsError" ||
    tag === "ProfileHasNoPicsError" ||
    tag === "PrivateProfileNotFollowedError" ||
    tag === "LoginRequiredError" ||
    tag === "LoginError" ||
    tag === "TwoFactorAuthRequiredError" ||
    tag === "BadCredentialsError" ||
    tag === "ConnectionError" ||
    tag === "TooManyRequestsError" ||
    tag === "InvalidArgumentError" ||
    tag === "BadResponseError" ||
    tag === "PostChangedError" ||
    tag === "IPhoneSupportDisabledError"
  );
}

/**
 * Type guard to check if an error is a login-related error.
 */
export function isAuthenticationError(
  error: unknown,
): error is AuthenticationErrors {
  if (error === null || typeof error !== "object") return false;
  const tag = (error as { _tag?: string })._tag;
  return (
    tag === "LoginRequiredError" ||
    tag === "LoginError" ||
    tag === "TwoFactorAuthRequiredError" ||
    tag === "BadCredentialsError"
  );
}

/**
 * Type guard to check if an error is a connection-related error.
 */
export function isConnectionError(
  error: unknown,
): error is ConnectionErrors {
  if (error === null || typeof error !== "object") return false;
  const tag = (error as { _tag?: string })._tag;
  return (
    tag === "ConnectionError" ||
    tag === "TooManyRequestsError" ||
    tag === "QueryReturnedNotFoundError"
  );
}

/**
 * Type guard to check if an error is an AbortDownloadError.
 */
export function isAbortDownloadError(
  error: unknown,
): error is AbortDownloadError {
  if (error === null || typeof error !== "object") return false;
  return (error as { _tag?: string })._tag === "AbortDownloadError";
}

// ============================================================================
// Legacy Exception Aliases (for backward compatibility during migration)
// ============================================================================

/** @deprecated Use InstaloaderError instead */
export const InstaloaderException = InstaloaderError;
/** @deprecated Use QueryReturnedBadRequestError instead */
export const QueryReturnedBadRequestException = QueryReturnedBadRequestError;
/** @deprecated Use QueryReturnedForbiddenError instead */
export const QueryReturnedForbiddenException = QueryReturnedForbiddenError;
/** @deprecated Use QueryReturnedNotFoundError instead */
export const QueryReturnedNotFoundException = QueryReturnedNotFoundError;
/** @deprecated Use ProfileNotExistsError instead */
export const ProfileNotExistsException = ProfileNotExistsError;
/** @deprecated Use ProfileHasNoPicsError instead */
export const ProfileHasNoPicsException = ProfileHasNoPicsError;
/** @deprecated Use PrivateProfileNotFollowedError instead */
export const PrivateProfileNotFollowedException = PrivateProfileNotFollowedError;
/** @deprecated Use LoginRequiredError instead */
export const LoginRequiredException = LoginRequiredError;
/** @deprecated Use LoginError instead */
export const LoginException = LoginError;
/** @deprecated Use TwoFactorAuthRequiredError instead */
export const TwoFactorAuthRequiredException = TwoFactorAuthRequiredError;
/** @deprecated Use BadCredentialsError instead */
export const BadCredentialsException = BadCredentialsError;
/** @deprecated Use ConnectionError instead */
export const ConnectionException = ConnectionError;
/** @deprecated Use TooManyRequestsError instead */
export const TooManyRequestsException = TooManyRequestsError;
/** @deprecated Use InvalidArgumentError instead */
export const InvalidArgumentException = InvalidArgumentError;
/** @deprecated Use BadResponseError instead */
export const BadResponseException = BadResponseError;
/** @deprecated Use PostChangedError instead */
export const PostChangedException = PostChangedError;
/** @deprecated Use IPhoneSupportDisabledError instead */
export const IPhoneSupportDisabledException = IPhoneSupportDisabledError;
/** @deprecated Use AbortDownloadError instead */
export const AbortDownloadException = AbortDownloadError;
/** @deprecated Use isInstaloaderError instead */
export const isInstaloaderException = isInstaloaderError;
/** @deprecated Use isAuthenticationError instead */
export const isLoginException = isAuthenticationError;
/** @deprecated Use isConnectionError instead */
export const isConnectionException = isConnectionError;
