import { describe, test, expect } from "bun:test";
import {
  InstaloaderException,
  LoginException,
  LoginRequiredException,
  BadCredentialsException,
  TwoFactorAuthRequiredException,
  ConnectionException,
  InvalidArgumentException,
  BadResponseException,
  QueryReturnedBadRequestException,
  QueryReturnedNotFoundException,
  QueryReturnedForbiddenException,
  ProfileNotExistsException,
  PostChangedException,
  TooManyRequestsException,
  PrivateProfileNotFollowedException,
  AbortDownloadException,
  IPhoneSupportDisabledException,
} from "../src/index.ts";

describe("Exceptions", () => {
  test("InstaloaderException is base class", () => {
    const err = new InstaloaderException("test");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("test");
    expect(err.name).toBe("InstaloaderException");
  });

  test("LoginException extends InstaloaderException", () => {
    const err = new LoginException("login failed");
    expect(err).toBeInstanceOf(InstaloaderException);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("login failed");
  });

  test("LoginRequiredException extends InstaloaderException", () => {
    const err = new LoginRequiredException("login required");
    expect(err).toBeInstanceOf(InstaloaderException);
    expect(err.name).toBe("LoginRequiredException");
  });

  test("BadCredentialsException extends InstaloaderException", () => {
    const err = new BadCredentialsException("wrong password");
    expect(err).toBeInstanceOf(InstaloaderException);
  });

  test("TwoFactorAuthRequiredException contains identifier", () => {
    const err = new TwoFactorAuthRequiredException("2fa required", "abc123");
    expect(err).toBeInstanceOf(InstaloaderException);
    expect(err.twoFactorIdentifier).toBe("abc123");
  });

  test("ConnectionException extends InstaloaderException", () => {
    const err = new ConnectionException("network error");
    expect(err).toBeInstanceOf(InstaloaderException);
  });

  test("InvalidArgumentException extends InstaloaderException", () => {
    const err = new InvalidArgumentException("invalid arg");
    expect(err).toBeInstanceOf(InstaloaderException);
  });

  test("BadResponseException extends InstaloaderException", () => {
    const err = new BadResponseException("bad response");
    expect(err).toBeInstanceOf(InstaloaderException);
  });

  test("QueryReturnedBadRequestException extends InstaloaderException", () => {
    const err = new QueryReturnedBadRequestException("400 error");
    expect(err).toBeInstanceOf(InstaloaderException);
  });

  test("QueryReturnedNotFoundException extends ConnectionException", () => {
    const err = new QueryReturnedNotFoundException("404 error");
    expect(err).toBeInstanceOf(ConnectionException);
  });

  test("QueryReturnedForbiddenException extends InstaloaderException", () => {
    const err = new QueryReturnedForbiddenException("403 error");
    expect(err).toBeInstanceOf(InstaloaderException);
  });

  test("ProfileNotExistsException extends InstaloaderException", () => {
    const err = new ProfileNotExistsException("profile not found");
    expect(err).toBeInstanceOf(InstaloaderException);
  });

  test("PostChangedException extends InstaloaderException", () => {
    const err = new PostChangedException();
    expect(err).toBeInstanceOf(InstaloaderException);
  });

  test("TooManyRequestsException extends ConnectionException", () => {
    const err = new TooManyRequestsException("429 error");
    expect(err).toBeInstanceOf(ConnectionException);
  });

  test("PrivateProfileNotFollowedException extends InstaloaderException", () => {
    const err = new PrivateProfileNotFollowedException("not following");
    expect(err).toBeInstanceOf(InstaloaderException);
  });

  test("AbortDownloadException does NOT extend InstaloaderException", () => {
    const err = new AbortDownloadException("download aborted");
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(InstaloaderException);
  });

  test("IPhoneSupportDisabledException extends InstaloaderException", () => {
    const err = new IPhoneSupportDisabledException("iphone disabled");
    expect(err).toBeInstanceOf(InstaloaderException);
  });
});
