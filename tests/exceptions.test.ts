import { describe, test, expect } from "bun:test";
import { EffectExceptions } from "../src/index.ts";

const {
  InstaloaderError,
  LoginError,
  LoginRequiredError,
  BadCredentialsError,
  TwoFactorAuthRequiredError,
  ConnectionError,
  InvalidArgumentError,
  BadResponseError,
  QueryReturnedBadRequestError,
  QueryReturnedNotFoundError,
  QueryReturnedForbiddenError,
  ProfileNotExistsError,
  PostChangedError,
  TooManyRequestsError,
  PrivateProfileNotFollowedError,
  AbortDownloadError,
  IPhoneSupportDisabledError,
} = EffectExceptions;

describe("Effect Errors", () => {
  test("InstaloaderError has _tag", () => {
    const err = new InstaloaderError({ message: "test" });
    expect(err._tag).toBe("InstaloaderError");
    expect(err.message).toBe("test");
  });

  test("LoginError has _tag", () => {
    const err = new LoginError({ message: "login failed" });
    expect(err._tag).toBe("LoginError");
    expect(err.message).toBe("login failed");
  });

  test("LoginRequiredError has _tag", () => {
    const err = new LoginRequiredError({ message: "login required" });
    expect(err._tag).toBe("LoginRequiredError");
  });

  test("BadCredentialsError has _tag", () => {
    const err = new BadCredentialsError({ message: "wrong password" });
    expect(err._tag).toBe("BadCredentialsError");
  });

  test("TwoFactorAuthRequiredError contains identifier", () => {
    const err = new TwoFactorAuthRequiredError({ message: "2fa required", twoFactorIdentifier: "abc123" });
    expect(err._tag).toBe("TwoFactorAuthRequiredError");
    expect(err.twoFactorIdentifier).toBe("abc123");
  });

  test("ConnectionError has _tag", () => {
    const err = new ConnectionError({ message: "network error" });
    expect(err._tag).toBe("ConnectionError");
  });

  test("InvalidArgumentError has _tag", () => {
    const err = new InvalidArgumentError({ message: "invalid arg" });
    expect(err._tag).toBe("InvalidArgumentError");
  });

  test("BadResponseError has _tag", () => {
    const err = new BadResponseError({ message: "bad response" });
    expect(err._tag).toBe("BadResponseError");
  });

  test("QueryReturnedBadRequestError has _tag", () => {
    const err = new QueryReturnedBadRequestError({ message: "400 error" });
    expect(err._tag).toBe("QueryReturnedBadRequestError");
  });

  test("QueryReturnedNotFoundError has _tag", () => {
    const err = new QueryReturnedNotFoundError({ message: "404 error" });
    expect(err._tag).toBe("QueryReturnedNotFoundError");
  });

  test("QueryReturnedForbiddenError has _tag", () => {
    const err = new QueryReturnedForbiddenError({ message: "403 error" });
    expect(err._tag).toBe("QueryReturnedForbiddenError");
  });

  test("ProfileNotExistsError has _tag", () => {
    const err = new ProfileNotExistsError({ message: "profile not found" });
    expect(err._tag).toBe("ProfileNotExistsError");
  });

  test("PostChangedError has _tag", () => {
    const err = new PostChangedError({ message: "post changed" });
    expect(err._tag).toBe("PostChangedError");
  });

  test("TooManyRequestsError has _tag", () => {
    const err = new TooManyRequestsError({ message: "429 error" });
    expect(err._tag).toBe("TooManyRequestsError");
  });

  test("PrivateProfileNotFollowedError has _tag", () => {
    const err = new PrivateProfileNotFollowedError({ message: "not following" });
    expect(err._tag).toBe("PrivateProfileNotFollowedError");
  });

  test("AbortDownloadError has _tag", () => {
    const err = new AbortDownloadError({ message: "download aborted" });
    expect(err._tag).toBe("AbortDownloadError");
  });

  test("IPhoneSupportDisabledError has _tag", () => {
    const err = new IPhoneSupportDisabledError({ message: "iphone disabled" });
    expect(err._tag).toBe("IPhoneSupportDisabledError");
  });
});
