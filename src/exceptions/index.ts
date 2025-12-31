/**
 * Instaloader Exceptions
 *
 * Custom exception classes for handling various error conditions
 * during Instagram data retrieval and processing.
 */

/**
 * Base exception for instaloader-ts.
 * This exception should not be raised directly.
 */
export class InstaloaderException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "InstaloaderException";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Raised when Instagram returns HTTP 400 Bad Request.
 */
export class QueryReturnedBadRequestException extends InstaloaderException {
  constructor(message?: string) {
    super(message);
    this.name = "QueryReturnedBadRequestException";
  }
}

/**
 * Raised when Instagram returns HTTP 403 Forbidden.
 */
export class QueryReturnedForbiddenException extends InstaloaderException {
  constructor(message?: string) {
    super(message);
    this.name = "QueryReturnedForbiddenException";
  }
}

/**
 * Raised when the requested profile does not exist.
 */
export class ProfileNotExistsException extends InstaloaderException {
  constructor(message?: string) {
    super(message);
    this.name = "ProfileNotExistsException";
  }
}

/**
 * @deprecated Since 4.2.2 - Not raised anymore.
 * Raised when profile has no pictures.
 */
export class ProfileHasNoPicsException extends InstaloaderException {
  constructor(message?: string) {
    super(message);
    this.name = "ProfileHasNoPicsException";
  }
}

/**
 * Raised when trying to access a private profile that is not followed.
 */
export class PrivateProfileNotFollowedException extends InstaloaderException {
  constructor(message?: string) {
    super(message);
    this.name = "PrivateProfileNotFollowedException";
  }
}

/**
 * Raised when login is required to access the requested resource.
 */
export class LoginRequiredException extends InstaloaderException {
  constructor(message?: string) {
    super(message);
    this.name = "LoginRequiredException";
  }
}

/**
 * Raised when login fails.
 */
export class LoginException extends InstaloaderException {
  constructor(message?: string) {
    super(message);
    this.name = "LoginException";
  }
}

/**
 * Raised when two-factor authentication is required during login.
 */
export class TwoFactorAuthRequiredException extends LoginException {
  constructor(
    message?: string,
    public readonly twoFactorIdentifier?: string,
  ) {
    super(message);
    this.name = "TwoFactorAuthRequiredException";
  }
}

/**
 * Raised when an invalid argument is passed.
 */
export class InvalidArgumentException extends InstaloaderException {
  constructor(message?: string) {
    super(message);
    this.name = "InvalidArgumentException";
  }
}

/**
 * Raised when Instagram returns an unexpected or malformed response.
 */
export class BadResponseException extends InstaloaderException {
  constructor(message?: string) {
    super(message);
    this.name = "BadResponseException";
  }
}

/**
 * Raised when login credentials are incorrect.
 */
export class BadCredentialsException extends LoginException {
  constructor(message?: string) {
    super(message);
    this.name = "BadCredentialsException";
  }
}

/**
 * Raised when a connection error occurs.
 */
export class ConnectionException extends InstaloaderException {
  constructor(message?: string) {
    super(message);
    this.name = "ConnectionException";
  }
}

/**
 * Raised when a post has changed since it was loaded.
 * @since 4.2.2
 */
export class PostChangedException extends InstaloaderException {
  constructor(message?: string) {
    super(message);
    this.name = "PostChangedException";
  }
}

/**
 * Raised when Instagram returns HTTP 404 Not Found.
 */
export class QueryReturnedNotFoundException extends ConnectionException {
  constructor(message?: string) {
    super(message);
    this.name = "QueryReturnedNotFoundException";
  }
}

/**
 * Raised when Instagram returns HTTP 429 Too Many Requests.
 */
export class TooManyRequestsException extends ConnectionException {
  constructor(message?: string) {
    super(message);
    this.name = "TooManyRequestsException";
  }
}

/**
 * Raised when iPhone support is disabled but required.
 */
export class IPhoneSupportDisabledException extends InstaloaderException {
  constructor(message?: string) {
    super(message);
    this.name = "IPhoneSupportDisabledException";
  }
}

/**
 * Exception that aborts the download loop.
 *
 * This exception is NOT a subclass of InstaloaderException and is not
 * caught by error handlers inside the download loop, allowing for
 * immediate termination.
 *
 * @since 4.7
 */
export class AbortDownloadException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "AbortDownloadException";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Type guard to check if an error is an InstaloaderException.
 */
export function isInstaloaderException(
  error: unknown,
): error is InstaloaderException {
  return error instanceof InstaloaderException;
}

/**
 * Type guard to check if an error is a LoginException.
 */
export function isLoginException(error: unknown): error is LoginException {
  return error instanceof LoginException;
}

/**
 * Type guard to check if an error is a ConnectionException.
 */
export function isConnectionException(
  error: unknown,
): error is ConnectionException {
  return error instanceof ConnectionException;
}
