import { Effect, Ref, Duration, pipe } from "effect";
import {
  AbortDownloadError,
  BadCredentialsError,
  BadResponseError,
  ConnectionError,
  InstaloaderError,
  InvalidArgumentError,
  LoginError,
  LoginRequiredError,
  QueryReturnedBadRequestError,
  QueryReturnedForbiddenError,
  QueryReturnedNotFoundError,
  TooManyRequestsError,
  TwoFactorAuthRequiredError,
  type InstaloaderErrors,
} from "../exceptions/index.ts";

export type ContextError =
  | InstaloaderErrors
  | AbortDownloadError;

export const defaultUserAgent = (): string =>
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

export const defaultIphoneHeaders = (): Record<string, string> => {
  const timezoneOffset = new Date().getTimezoneOffset() * -60;
  return {
    "User-Agent":
      "Instagram 361.0.0.35.82 (iPad13,8; iOS 18_0; en_US; en-US; scale=2.00; 2048x2732; 674117118) AppleWebKit/420+",
    "x-ads-opt-out": "1",
    "x-bloks-is-panorama-enabled": "true",
    "x-bloks-version-id":
      "16b7bd25c6c06886d57c4d455265669345a2d96625385b8ee30026ac2dc5ed97",
    "x-fb-client-ip": "True",
    "x-fb-connection-type": "wifi",
    "x-fb-http-engine": "Liger",
    "x-fb-server-cluster": "True",
    "x-fb": "1",
    "x-ig-abr-connection-speed-kbps": "2",
    "x-ig-app-id": "124024574287414",
    "x-ig-app-locale": "en-US",
    "x-ig-app-startup-country": "US",
    "x-ig-bandwidth-speed-kbps": "0.000",
    "x-ig-capabilities": "36r/F/8=",
    "x-ig-connection-speed": `${Math.floor(Math.random() * 19000) + 1000}kbps`,
    "x-ig-connection-type": "WiFi",
    "x-ig-device-locale": "en-US",
    "x-ig-mapped-locale": "en-US",
    "x-ig-timezone-offset": String(timezoneOffset),
    "x-ig-www-claim": "0",
    "x-pigeon-session-id": crypto.randomUUID(),
    "x-tigon-is-retry": "False",
    "x-whatsapp": "0",
  };
};

export interface CookieJar {
  [key: string]: string;
}

export interface InstaloaderContextOptions {
  sleep?: boolean;
  quiet?: boolean;
  userAgent?: string;
  maxConnectionAttempts?: number;
  requestTimeout?: number;
  fatalStatusCodes?: number[];
  iphoneSupport?: boolean;
}

// Internal mutable state for the context
interface ContextState {
  cookies: CookieJar;
  csrfToken: string;
  username: string | null;
  userId: string | null;
  errorLog: string[];
  iphoneHeaders: Record<string, string>;
  twoFactorAuthPending: {
    cookies: CookieJar;
    csrfToken: string;
    user: string;
    twoFactorId: string;
  } | null;
  queryTimestamps: Map<string, number[]>;
  earliestNextRequestTime: number;
  iphoneEarliestNextRequestTime: number;
  profileIdCache: Map<number, unknown>;
}

const createInitialState = (): ContextState => ({
  cookies: {
    sessionid: "",
    mid: "",
    ig_pr: "1",
    ig_vw: "1920",
    csrftoken: "",
    s_network: "",
    ds_user_id: "",
  },
  csrfToken: "",
  username: null,
  userId: null,
  errorLog: [],
  iphoneHeaders: defaultIphoneHeaders(),
  twoFactorAuthPending: null,
  queryTimestamps: new Map(),
  earliestNextRequestTime: 0,
  iphoneEarliestNextRequestTime: 0,
  profileIdCache: new Map(),
});

export interface InstaloaderContextShape {
  readonly options: Required<InstaloaderContextOptions>;
  readonly stateRef: Ref.Ref<ContextState>;

  readonly isLoggedIn: Effect.Effect<boolean>;
  readonly getUsername: Effect.Effect<string | null>;
  readonly getUserId: Effect.Effect<string | null>;

  readonly log: (...msg: unknown[]) => Effect.Effect<void>;
  readonly error: (msg: string, repeatAtEnd?: boolean) => Effect.Effect<void>;
  readonly hasStoredErrors: Effect.Effect<boolean>;
  readonly close: Effect.Effect<void>;

  readonly saveSession: Effect.Effect<CookieJar>;
  readonly updateCookies: (cookies: CookieJar) => Effect.Effect<void>;
  readonly loadSession: (username: string, sessionData: CookieJar) => Effect.Effect<void>;

  readonly testLogin: Effect.Effect<string | null, ContextError>;
  readonly login: (user: string, passwd: string) => Effect.Effect<void, ContextError>;
  readonly twoFactorLogin: (code: string) => Effect.Effect<void, ContextError>;

  readonly doSleep: Effect.Effect<void>;

  readonly getJson: (
    path: string,
    params: Record<string, string>,
    options?: { host?: string; usePost?: boolean; attempt?: number }
  ) => Effect.Effect<Record<string, unknown>, ContextError>;

  readonly graphqlQuery: (
    queryHash: string,
    variables: Record<string, unknown>,
    referer?: string
  ) => Effect.Effect<Record<string, unknown>, ContextError>;

  readonly docIdGraphqlQuery: (
    docId: string,
    variables: Record<string, unknown>,
    referer?: string
  ) => Effect.Effect<Record<string, unknown>, ContextError>;

  readonly getIphoneJson: (
    path: string,
    params: Record<string, string>
  ) => Effect.Effect<Record<string, unknown>, ContextError>;

  readonly getRaw: (url: string) => Effect.Effect<Response, ContextError>;
  readonly head: (url: string, allowRedirects?: boolean) => Effect.Effect<Response, ContextError>;
}

// Helper functions
const defaultHttpHeaders = (userAgent: string, emptySessionOnly = false): Record<string, string> => {
  const headers: Record<string, string> = {
    "Accept-Encoding": "gzip, deflate",
    "Accept-Language": "en-US,en;q=0.8",
    Connection: "keep-alive",
    "Content-Length": "0",
    Host: "www.instagram.com",
    Origin: "https://www.instagram.com",
    Referer: "https://www.instagram.com/",
    "User-Agent": userAgent,
    "X-Instagram-AJAX": "1",
    "X-Requested-With": "XMLHttpRequest",
  };

  if (emptySessionOnly) {
    delete headers["Host"];
    delete headers["Origin"];
    delete headers["X-Instagram-AJAX"];
    delete headers["X-Requested-With"];
  }

  return headers;
};

const getCookieHeader = (cookies: CookieJar): string =>
  Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

const parseCookies = (setCookieHeaders: string[], state: ContextState): void => {
  for (const header of setCookieHeaders) {
    const match = header.match(/^([^=]+)=([^;]*)/);
    if (match) {
      const [, name, value] = match;
      if (name && value !== undefined) {
        state.cookies[name] = value;
      }
    }
  }
  if (state.cookies["csrftoken"]) {
    state.csrfToken = state.cookies["csrftoken"];
  }
};

const responseError = (resp: Response, body?: string): string => {
  let extraFromJson: string | null = null;
  if (body) {
    try {
      const respJson = JSON.parse(body) as Record<string, unknown>;
      if ("status" in respJson) {
        extraFromJson =
          "message" in respJson
            ? `"${respJson["status"]}" status, message "${respJson["message"]}"`
            : `"${respJson["status"]}" status`;
      }
    } catch {
      // Ignore JSON parse errors
    }
  }
  return `${resp.status} ${resp.statusText}${extraFromJson ? ` - ${extraFromJson}` : ""} when accessing ${resp.url}`;
};

// Rate controller functions
const countPerSlidingWindow = (queryType: string): number =>
  queryType === "other" ? 75 : 200;

const reqsInSlidingWindow = (
  queryTimestamps: Map<string, number[]>,
  queryType: string | null,
  currentTime: number,
  window: number
): number[] => {
  if (queryType !== null) {
    const timestamps = queryTimestamps.get(queryType) ?? [];
    return timestamps.filter((t) => t > currentTime - window);
  }

  const allTimestamps: number[] = [];
  for (const [type, timestamps] of queryTimestamps.entries()) {
    if (type !== "iphone" && type !== "other") {
      allTimestamps.push(...timestamps.filter((t) => t > currentTime - window));
    }
  }
  return allTimestamps;
};

const queryWaittime = (
  state: ContextState,
  queryType: string,
  currentTime: number,
  untrackedQueries = false
): number => {
  const perTypeSlidingWindow = 660;
  const iphoneSlidingWindow = 1800;

  if (!state.queryTimestamps.has(queryType)) {
    state.queryTimestamps.set(queryType, []);
  }

  const timestamps = state.queryTimestamps.get(queryType)!;
  state.queryTimestamps.set(
    queryType,
    timestamps.filter((t) => t > currentTime - 3600)
  );

  const perTypeNextRequestTime = (): number => {
    const reqs = reqsInSlidingWindow(
      state.queryTimestamps,
      queryType,
      currentTime,
      perTypeSlidingWindow
    );
    if (reqs.length < countPerSlidingWindow(queryType)) {
      return 0;
    }
    return Math.min(...reqs) + perTypeSlidingWindow + 6;
  };

  const gqlAccumulatedNextRequestTime = (): number => {
    if (queryType === "iphone" || queryType === "other") {
      return 0;
    }
    const gqlAccumulatedSlidingWindow = 600;
    const gqlAccumulatedMaxCount = 275;
    const reqs = reqsInSlidingWindow(
      state.queryTimestamps,
      null,
      currentTime,
      gqlAccumulatedSlidingWindow
    );
    if (reqs.length < gqlAccumulatedMaxCount) {
      return 0;
    }
    return Math.min(...reqs) + gqlAccumulatedSlidingWindow;
  };

  const untrackedNextRequestTime = (): number => {
    if (untrackedQueries) {
      if (queryType === "iphone") {
        const reqs = reqsInSlidingWindow(
          state.queryTimestamps,
          queryType,
          currentTime,
          iphoneSlidingWindow
        );
        if (reqs.length > 0) {
          state.iphoneEarliestNextRequestTime =
            Math.min(...reqs) + iphoneSlidingWindow + 18;
        }
      } else {
        const reqs = reqsInSlidingWindow(
          state.queryTimestamps,
          queryType,
          currentTime,
          perTypeSlidingWindow
        );
        if (reqs.length > 0) {
          state.earliestNextRequestTime =
            Math.min(...reqs) + perTypeSlidingWindow + 6;
        }
      }
    }
    return Math.max(
      state.iphoneEarliestNextRequestTime,
      state.earliestNextRequestTime
    );
  };

  const iphoneNextRequest = (): number => {
    if (queryType === "iphone") {
      const reqs = reqsInSlidingWindow(
        state.queryTimestamps,
        queryType,
        currentTime,
        iphoneSlidingWindow
      );
      if (reqs.length >= 199) {
        return Math.min(...reqs) + iphoneSlidingWindow + 18;
      }
    }
    return 0;
  };

  return Math.max(
    0,
    Math.max(
      perTypeNextRequestTime(),
      gqlAccumulatedNextRequestTime(),
      untrackedNextRequestTime(),
      iphoneNextRequest()
    ) - currentTime
  );
};

// Factory function to create a pure Effect-based context
export const makeInstaloaderContext = (
  options: InstaloaderContextOptions = {}
): Effect.Effect<InstaloaderContextShape> =>
  Effect.gen(function* () {
    const stateRef = yield* Ref.make(createInitialState());

    const opts: Required<InstaloaderContextOptions> = {
      sleep: options.sleep ?? true,
      quiet: options.quiet ?? false,
      userAgent: options.userAgent ?? defaultUserAgent(),
      maxConnectionAttempts: options.maxConnectionAttempts ?? 3,
      requestTimeout: options.requestTimeout ?? 300000,
      fatalStatusCodes: options.fatalStatusCodes ?? [],
      iphoneSupport: options.iphoneSupport ?? true,
    };

    // Core fetch function with timeout
    const fetchWithTimeout = (
      url: string,
      fetchOptions: RequestInit
    ): Effect.Effect<Response, ConnectionError> =>
      pipe(
        Effect.tryPromise({
          try: () =>
            fetch(url, {
              ...fetchOptions,
              signal: AbortSignal.timeout(opts.requestTimeout),
            }),
          catch: (error) =>
            new ConnectionError({
              message: `Fetch failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
            }),
        })
      );

    // Log function
    const log = (...msg: unknown[]): Effect.Effect<void> =>
      Effect.sync(() => {
        if (!opts.quiet) {
          console.log(...msg);
        }
      });

    // Error logging function
    const errorFn = (msg: string, repeatAtEnd = true): Effect.Effect<void> =>
      Effect.gen(function* () {
        console.error(msg);
        if (repeatAtEnd) {
          yield* Ref.update(stateRef, (s) => ({
            ...s,
            errorLog: [...s.errorLog, msg],
          }));
        }
      });

    // Sleep effect with random exponential backoff
    const doSleep: Effect.Effect<void> = Effect.gen(function* () {
      if (opts.sleep) {
        const sleepTime = Math.min(-Math.log(Math.random()) / 0.6, 15.0);
        yield* Effect.sleep(Duration.millis(sleepTime * 1000));
      }
    });

    // Wait before query (rate limiting)
    const waitBeforeQuery = (queryType: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const state = yield* Ref.get(stateRef);
        const currentTime = performance.now() / 1000;
        const waittime = queryWaittime(state, queryType, currentTime, false);

        if (waittime > 15) {
          const formatted =
            waittime <= 666
              ? `${Math.round(waittime)} seconds`
              : `${Math.round(waittime / 60)} minutes`;
          const resumeTime = new Date(Date.now() + waittime * 1000);
          yield* log(
            `\nToo many queries in the last time. Need to wait ${formatted}, until ${resumeTime.toLocaleTimeString()}.`
          );
        }

        if (waittime > 0) {
          yield* Effect.sleep(Duration.millis(waittime * 1000));
        }

        yield* Ref.update(stateRef, (s) => {
          const timestamps = s.queryTimestamps.get(queryType) ?? [];
          timestamps.push(performance.now() / 1000);
          s.queryTimestamps.set(queryType, timestamps);
          return s;
        });
      });

    // Handle 429 rate limit
    const handle429 = (queryType: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const state = yield* Ref.get(stateRef);
        const currentTime = performance.now() / 1000;
        const waittime = queryWaittime(state, queryType, currentTime, true);

        yield* errorFn(
          'Instagram responded with HTTP error "429 - Too Many Requests". Please do not run multiple instances of Instaloader in parallel or within short sequence.',
          false
        );

        if (waittime > 1.5) {
          const formatted =
            waittime <= 666
              ? `${Math.round(waittime)} seconds`
              : `${Math.round(waittime / 60)} minutes`;
          const resumeTime = new Date(Date.now() + waittime * 1000);
          yield* errorFn(
            `The request will be retried in ${formatted}, at ${resumeTime.toLocaleTimeString()}.`,
            false
          );
        }

        if (waittime > 0) {
          yield* Effect.sleep(Duration.millis(waittime * 1000));
        }
      });

    // Get JSON
    const getJson = (
      path: string,
      params: Record<string, string>,
      jsonOptions: { host?: string; usePost?: boolean; attempt?: number } = {}
    ): Effect.Effect<Record<string, unknown>, ContextError> =>
      Effect.gen(function* () {
        const { host = "www.instagram.com", usePost = false, attempt = 1 } = jsonOptions;
        const state = yield* Ref.get(stateRef);

        const isGraphqlQuery =
          "query_hash" in params && path.includes("graphql/query");
        const isDocIdQuery = "doc_id" in params && path.includes("graphql/query");
        const isIphoneQuery = host === "i.instagram.com";
        const isOtherQuery =
          !isGraphqlQuery && !isDocIdQuery && host === "www.instagram.com";

        yield* doSleep;

        if (isGraphqlQuery) {
          yield* waitBeforeQuery(params["query_hash"]!);
        }
        if (isDocIdQuery) {
          yield* waitBeforeQuery(params["doc_id"]!);
        }
        if (isIphoneQuery) {
          yield* waitBeforeQuery("iphone");
        }
        if (isOtherQuery) {
          yield* waitBeforeQuery("other");
        }

        const headers: Record<string, string> = {
          ...defaultHttpHeaders(opts.userAgent, true),
          authority: "www.instagram.com",
          scheme: "https",
          accept: "*/*",
          "X-CSRFToken": state.csrfToken,
          Cookie: getCookieHeader(state.cookies),
        };
        delete headers["Connection"];
        delete headers["Content-Length"];

        let url: string;
        let fetchOptions: RequestInit;

        if (usePost) {
          url = `https://${host}/${path}`;
          fetchOptions = {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams(params).toString(),
            redirect: "manual",
          };
        } else {
          const searchParams = new URLSearchParams(params);
          url = `https://${host}/${path}?${searchParams.toString()}`;
          fetchOptions = {
            method: "GET",
            headers,
            redirect: "manual",
          };
        }

        const result = yield* pipe(
          fetchWithTimeout(url, fetchOptions),
          Effect.flatMap((resp) =>
            Effect.gen(function* () {
              if (opts.fatalStatusCodes.includes(resp.status)) {
                const body = yield* Effect.tryPromise({
                  try: () => resp.text(),
                  catch: () => new ConnectionError({ message: "Failed to read response body" }),
                });
                return yield* Effect.fail(
                  new AbortDownloadError({
                    message: `Query to ${url} responded with "${resp.status} ${resp.statusText}"${body ? `: ${body.slice(0, 500)}` : ""}`,
                  })
                );
              }

              if (resp.status >= 300 && resp.status < 400) {
                const location = resp.headers.get("location");
                if (
                  location?.startsWith("https://www.instagram.com/accounts/login") ||
                  location?.startsWith("https://i.instagram.com/accounts/login")
                ) {
                  const currentState = yield* Ref.get(stateRef);
                  if (currentState.username === null) {
                    return yield* Effect.fail(
                      new LoginRequiredError({
                        message: "Redirected to login page. Use login() first.",
                      })
                    );
                  }
                  return yield* Effect.fail(
                    new AbortDownloadError({
                      message:
                        "Redirected to login page. You've been logged out, please wait some time, recreate the session and try again",
                    })
                  );
                }
              }

              const bodyText = yield* Effect.tryPromise({
                try: () => resp.text(),
                catch: () => new ConnectionError({ message: "Failed to read response body" }),
              });

              if (resp.status === 400) {
                try {
                  const respJson = JSON.parse(bodyText) as Record<string, unknown>;
                  if (
                    ["feedback_required", "checkpoint_required", "challenge_required"].includes(
                      respJson["message"] as string
                    )
                  ) {
                    return yield* Effect.fail(
                      new AbortDownloadError({
                        message: responseError(resp, bodyText),
                      })
                    );
                  }
                } catch {
                  // Ignore parse error
                }
                return yield* Effect.fail(
                  new QueryReturnedBadRequestError({
                    message: responseError(resp, bodyText),
                  })
                );
              }

              if (resp.status === 404) {
                return yield* Effect.fail(
                  new QueryReturnedNotFoundError({
                    message: responseError(resp, bodyText),
                  })
                );
              }

              if (resp.status === 429) {
                return yield* Effect.fail(
                  new TooManyRequestsError({
                    message: responseError(resp, bodyText),
                  })
                );
              }

              if (resp.status !== 200) {
                return yield* Effect.fail(
                  new ConnectionError({
                    message: responseError(resp, bodyText),
                  })
                );
              }

              const respJson = JSON.parse(bodyText) as Record<string, unknown>;

              if (respJson["status"] && respJson["status"] !== "ok") {
                return yield* Effect.fail(
                  new ConnectionError({
                    message: responseError(resp, bodyText),
                  })
                );
              }

              return respJson;
            })
          ),
          Effect.catchAll((err) =>
            Effect.gen(function* () {
              if (err instanceof InstaloaderError || err instanceof AbortDownloadError) {
                const errorString = `JSON Query to ${path}: ${err.message}`;

                if (attempt >= opts.maxConnectionAttempts) {
                  if (err instanceof QueryReturnedNotFoundError) {
                    return yield* Effect.fail(
                      new QueryReturnedNotFoundError({ message: errorString })
                    );
                  }
                  return yield* Effect.fail(
                    new ConnectionError({ message: errorString })
                  );
                }

                yield* errorFn(`${errorString} [retrying]`, false);

                if (err instanceof TooManyRequestsError) {
                  if (isGraphqlQuery) {
                    yield* handle429(params["query_hash"]!);
                  }
                  if (isDocIdQuery) {
                    yield* handle429(params["doc_id"]!);
                  }
                  if (isIphoneQuery) {
                    yield* handle429("iphone");
                  }
                  if (isOtherQuery) {
                    yield* handle429("other");
                  }
                }

                return yield* getJson(path, params, {
                  host,
                  usePost,
                  attempt: attempt + 1,
                });
              }
              return yield* Effect.fail(err);
            })
          )
        );

        return result;
      });

    // GraphQL query
    const graphqlQuery = (
      queryHash: string,
      variables: Record<string, unknown>,
      _referer?: string
    ): Effect.Effect<Record<string, unknown>, ContextError> =>
      Effect.gen(function* () {
        const params: Record<string, string> = {
          query_hash: queryHash,
          variables: JSON.stringify(variables),
        };

        const respJson = yield* getJson("graphql/query", params);

        if (!("status" in respJson)) {
          yield* errorFn('GraphQL response did not contain a "status" field.');
        }

        return respJson;
      });

    // Doc ID GraphQL query
    const docIdGraphqlQuery = (
      docId: string,
      variables: Record<string, unknown>,
      _referer?: string
    ): Effect.Effect<Record<string, unknown>, ContextError> =>
      Effect.gen(function* () {
        const params: Record<string, string> = {
          variables: JSON.stringify(variables),
          doc_id: docId,
          server_timestamps: "true",
        };

        const respJson = yield* getJson("graphql/query", params, { usePost: true });

        if (!("status" in respJson)) {
          yield* errorFn('GraphQL response did not contain a "status" field.');
        }

        return respJson;
      });

    // Get iPhone JSON
    const getIphoneJson = (
      path: string,
      params: Record<string, string>
    ): Effect.Effect<Record<string, unknown>, ContextError> =>
      Effect.gen(function* () {
        const state = yield* Ref.get(stateRef);

        const headers: Record<string, string> = {
          ...state.iphoneHeaders,
          "ig-intended-user-id": state.userId ?? "",
          "x-pigeon-rawclienttime": (Date.now() / 1000).toFixed(6),
          Cookie: getCookieHeader(state.cookies),
          "User-Agent":
            state.iphoneHeaders["User-Agent"] ??
            defaultIphoneHeaders()["User-Agent"] ??
            "",
        };

        const headerCookiesMapping: Record<string, string> = {
          "x-mid": "mid",
          "ig-u-ds-user-id": "ds_user_id",
          "x-ig-device-id": "ig_did",
          "x-ig-family-device-id": "ig_did",
          family_device_id: "ig_did",
        };

        for (const [headerKey, cookieKey] of Object.entries(headerCookiesMapping)) {
          if (state.cookies[cookieKey] && !headers[headerKey]) {
            headers[headerKey] = state.cookies[cookieKey];
          }
        }

        if (state.cookies["rur"] && !headers["ig-u-rur"]) {
          headers["ig-u-rur"] = state.cookies["rur"].replace(/"/g, "");
        }

        for (const header of [
          "Host",
          "Origin",
          "X-Instagram-AJAX",
          "X-Requested-With",
          "Referer",
        ]) {
          delete headers[header];
        }

        const searchParams = new URLSearchParams(params);
        const url = `https://i.instagram.com/${path}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

        const resp = yield* fetchWithTimeout(url, {
          method: "GET",
          headers,
        });

        // Update iPhone headers from response
        yield* Ref.update(stateRef, (s) => {
          const newIphoneHeaders = { ...s.iphoneHeaders };
          resp.headers.forEach((value, key) => {
            if (key.startsWith("ig-set-")) {
              newIphoneHeaders[key.replace("ig-set-", "")] = value;
            } else if (key.startsWith("x-ig-set-")) {
              newIphoneHeaders[key.replace("x-ig-set-", "x-ig-")] = value;
            }
          });
          return { ...s, iphoneHeaders: newIphoneHeaders };
        });

        const bodyText = yield* Effect.tryPromise({
          try: () => resp.text(),
          catch: () => new ConnectionError({ message: "Failed to read response body" }),
        });

        if (resp.status === 404) {
          return yield* Effect.fail(
            new QueryReturnedNotFoundError({
              message: responseError(resp, bodyText),
            })
          );
        }

        if (resp.status !== 200) {
          return yield* Effect.fail(
            new ConnectionError({ message: responseError(resp, bodyText) })
          );
        }

        try {
          return JSON.parse(bodyText) as Record<string, unknown>;
        } catch {
          return yield* Effect.fail(
            new BadResponseError({
              message: `Failed to parse JSON response from ${url}: ${bodyText.slice(0, 200)}`,
            })
          );
        }
      });

    // Get raw response
    const getRaw = (url: string): Effect.Effect<Response, ContextError> =>
      Effect.gen(function* () {
        const resp = yield* fetchWithTimeout(url, {
          method: "GET",
          headers: defaultHttpHeaders(opts.userAgent, true),
        });

        if (resp.status === 200) {
          return resp;
        }

        if (resp.status === 403) {
          return yield* Effect.fail(
            new QueryReturnedForbiddenError({
              message: responseError(resp),
            })
          );
        }

        if (resp.status === 404) {
          return yield* Effect.fail(
            new QueryReturnedNotFoundError({ message: responseError(resp) })
          );
        }

        return yield* Effect.fail(
          new ConnectionError({ message: responseError(resp) })
        );
      });

    // HEAD request
    const head = (
      url: string,
      allowRedirects = false
    ): Effect.Effect<Response, ContextError> =>
      Effect.gen(function* () {
        const resp = yield* fetchWithTimeout(url, {
          method: "HEAD",
          headers: defaultHttpHeaders(opts.userAgent, true),
          redirect: allowRedirects ? "follow" : "manual",
        });

        if (resp.status === 200) {
          return resp;
        }

        if (resp.status === 403) {
          return yield* Effect.fail(
            new QueryReturnedForbiddenError({ message: responseError(resp) })
          );
        }

        if (resp.status === 404) {
          return yield* Effect.fail(
            new QueryReturnedNotFoundError({ message: responseError(resp) })
          );
        }

        return yield* Effect.fail(
          new ConnectionError({ message: responseError(resp) })
        );
      });

    // Test login
    const testLogin: Effect.Effect<string | null, ContextError> = Effect.gen(function* () {
      const result = yield* pipe(
        graphqlQuery("d6f4427fbe92d846298cf93df0b937d3", {}),
        Effect.map((data) => {
          const dataObj = data["data"] as Record<string, unknown> | undefined;
          const user = dataObj?.["user"] as Record<string, unknown> | undefined;
          return (user?.["username"] as string) ?? null;
        }),
        Effect.catchAll((err) =>
          Effect.gen(function* () {
            if (err instanceof AbortDownloadError || err instanceof ConnectionError) {
              yield* errorFn(`Error when checking if logged in: ${err.message}`);
              return null;
            }
            return yield* Effect.fail(err);
          })
        )
      );
      return result;
    });

    // Login
    const login = (user: string, passwd: string): Effect.Effect<void, ContextError> =>
      Effect.gen(function* () {
        // Reset to anonymous session
        yield* Ref.update(stateRef, (s) => ({
          ...s,
          cookies: {
            sessionid: "",
            mid: "",
            ig_pr: "1",
            ig_vw: "1920",
            csrftoken: "",
            s_network: "",
            ds_user_id: "",
          },
          csrfToken: "",
        }));

        // Get initial page
        const initialResp = yield* fetchWithTimeout("https://www.instagram.com/", {
          headers: defaultHttpHeaders(opts.userAgent, true),
        });

        yield* Ref.update(stateRef, (s) => {
          parseCookies(initialResp.headers.getSetCookie(), s);
          return s;
        });

        yield* doSleep;

        const state = yield* Ref.get(stateRef);
        const encPassword = `#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now() / 1000)}:${passwd}`;

        const loginHeaders = {
          ...defaultHttpHeaders(opts.userAgent),
          "X-CSRFToken": state.csrfToken,
          Cookie: getCookieHeader(state.cookies),
          "Content-Type": "application/x-www-form-urlencoded",
        };

        const loginBody = new URLSearchParams({
          enc_password: encPassword,
          username: user,
        });

        const loginResp = yield* fetchWithTimeout(
          "https://www.instagram.com/api/v1/web/accounts/login/ajax/",
          {
            method: "POST",
            headers: loginHeaders,
            body: loginBody.toString(),
            redirect: "manual",
          }
        );

        yield* Ref.update(stateRef, (s) => {
          parseCookies(loginResp.headers.getSetCookie(), s);
          return s;
        });

        const respJson = yield* Effect.tryPromise({
          try: () => loginResp.json() as Promise<Record<string, unknown>>,
          catch: () =>
            new LoginError({
              message: `Login error: JSON decode fail, ${loginResp.status} - ${loginResp.statusText}.`,
            }),
        });

        if (respJson["two_factor_required"]) {
          const twoFactorInfo = respJson["two_factor_info"] as Record<string, unknown>;
          const currentState = yield* Ref.get(stateRef);
          yield* Ref.update(stateRef, (s) => ({
            ...s,
            twoFactorAuthPending: {
              cookies: { ...currentState.cookies },
              csrfToken: currentState.csrfToken,
              user,
              twoFactorId: twoFactorInfo["two_factor_identifier"] as string,
            },
          }));
          return yield* Effect.fail(
            new TwoFactorAuthRequiredError({
              message: "Login error: two-factor authentication required.",
              twoFactorIdentifier: twoFactorInfo["two_factor_identifier"] as string,
            })
          );
        }

        if (respJson["checkpoint_url"]) {
          return yield* Effect.fail(
            new LoginError({
              message: `Login: Checkpoint required. Point your browser to ${respJson["checkpoint_url"]} - follow the instructions, then retry.`,
            })
          );
        }

        if (respJson["status"] !== "ok") {
          const message = respJson["message"]
            ? `"${respJson["status"]}" status, message "${respJson["message"]}".`
            : `"${respJson["status"]}" status.`;
          return yield* Effect.fail(
            new LoginError({ message: `Login error: ${message}` })
          );
        }

        if (!("authenticated" in respJson)) {
          const message = respJson["message"]
            ? `Unexpected response, "${respJson["message"]}".`
            : "Unexpected response, this might indicate a blocked IP.";
          return yield* Effect.fail(
            new LoginError({ message: `Login error: ${message}` })
          );
        }

        if (!respJson["authenticated"]) {
          if (respJson["user"]) {
            return yield* Effect.fail(
              new BadCredentialsError({ message: "Login error: Wrong password." })
            );
          } else {
            return yield* Effect.fail(
              new LoginError({
                message: `Login error: User ${user} does not exist.`,
              })
            );
          }
        }

        yield* Ref.update(stateRef, (s) => ({
          ...s,
          username: user,
          userId: respJson["userId"] as string,
        }));
      });

    // Two factor login
    const twoFactorLogin = (twoFactorCode: string): Effect.Effect<void, ContextError> =>
      Effect.gen(function* () {
        const state = yield* Ref.get(stateRef);

        if (!state.twoFactorAuthPending) {
          return yield* Effect.fail(
            new InvalidArgumentError({
              message: "No two-factor authentication pending.",
            })
          );
        }

        const { cookies, csrfToken, user, twoFactorId } = state.twoFactorAuthPending;

        yield* Ref.update(stateRef, (s) => ({
          ...s,
          cookies,
          csrfToken,
        }));

        const updatedState = yield* Ref.get(stateRef);

        const loginBody = new URLSearchParams({
          username: user,
          verificationCode: twoFactorCode,
          identifier: twoFactorId,
        });

        const loginResp = yield* fetchWithTimeout(
          "https://www.instagram.com/accounts/login/ajax/two_factor/",
          {
            method: "POST",
            headers: {
              ...defaultHttpHeaders(opts.userAgent),
              "X-CSRFToken": updatedState.csrfToken,
              Cookie: getCookieHeader(updatedState.cookies),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: loginBody.toString(),
            redirect: "manual",
          }
        );

        yield* Ref.update(stateRef, (s) => {
          parseCookies(loginResp.headers.getSetCookie(), s);
          return s;
        });

        const respJson = yield* Effect.tryPromise({
          try: () => loginResp.json() as Promise<Record<string, unknown>>,
          catch: () =>
            new BadCredentialsError({ message: "2FA error: JSON decode fail" }),
        });

        if (respJson["status"] !== "ok") {
          const message = respJson["message"]
            ? `${respJson["message"]}`
            : `"${respJson["status"]}" status.`;
          return yield* Effect.fail(
            new BadCredentialsError({ message: `2FA error: ${message}` })
          );
        }

        yield* Ref.update(stateRef, (s) => ({
          ...s,
          username: user,
          twoFactorAuthPending: null,
        }));
      });

    // Return the context shape
    const context: InstaloaderContextShape = {
      options: opts,
      stateRef,

      isLoggedIn: Effect.map(Ref.get(stateRef), (s) => s.username !== null),
      getUsername: Effect.map(Ref.get(stateRef), (s) => s.username),
      getUserId: Effect.map(Ref.get(stateRef), (s) => s.userId),

      log,
      error: errorFn,
      hasStoredErrors: Effect.map(Ref.get(stateRef), (s) => s.errorLog.length > 0),
      close: Effect.gen(function* () {
        const state = yield* Ref.get(stateRef);
        if (state.errorLog.length > 0 && !opts.quiet) {
          console.error("\nErrors or warnings occurred:");
          for (const err of state.errorLog) {
            console.error(err);
          }
        }
      }),

      saveSession: Effect.map(Ref.get(stateRef), (s) => ({ ...s.cookies })),
      updateCookies: (cookies: CookieJar) =>
        Ref.update(stateRef, (s) => ({
          ...s,
          cookies: { ...s.cookies, ...cookies },
        })),
      loadSession: (username: string, sessionData: CookieJar) =>
        Ref.update(stateRef, (s) => ({
          ...s,
          cookies: { ...sessionData },
          csrfToken: sessionData["csrftoken"] ?? "",
          username,
        })),

      testLogin,
      login,
      twoFactorLogin,

      doSleep,

      getJson,
      graphqlQuery,
      docIdGraphqlQuery,
      getIphoneJson,
      getRaw,
      head,
    };

    return context;
  });

export const InstaloaderContextLive = (
  options?: InstaloaderContextOptions
): Effect.Effect<InstaloaderContextShape> => makeInstaloaderContext(options);
