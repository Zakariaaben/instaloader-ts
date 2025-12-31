import {
  AbortDownloadException,
  BadCredentialsException,
  BadResponseException,
  ConnectionException,
  InstaloaderException,
  InvalidArgumentException,
  LoginException,
  LoginRequiredException,
  QueryReturnedBadRequestException,
  QueryReturnedForbiddenException,
  QueryReturnedNotFoundException,
  TooManyRequestsException,
  TwoFactorAuthRequiredException,
} from "../exceptions/index.ts";

export function defaultUserAgent(): string {
  return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
}

export function defaultIphoneHeaders(): Record<string, string> {
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
}

export interface CookieJar {
  [key: string]: string;
}

export interface InstaloaderContextOptions {
  sleep?: boolean;
  quiet?: boolean;
  userAgent?: string;
  maxConnectionAttempts?: number;
  requestTimeout?: number;
  rateController?: (ctx: InstaloaderContext) => RateController;
  fatalStatusCodes?: number[];
  iphoneSupport?: boolean;
}

export class InstaloaderContext {
  userAgent: string;
  requestTimeout: number;
  username: string | null = null;
  userId: string | null = null;
  sleep: boolean;
  quiet: boolean;
  maxConnectionAttempts: number;
  iphoneSupport: boolean;
  iphoneHeaders: Record<string, string>;
  errorLog: string[] = [];
  raiseAllErrors = false;
  fatalStatusCodes: number[];
  profileIdCache: Map<number, unknown> = new Map();

  private cookies: CookieJar = {};
  private csrfToken = "";
  private rateController: RateController;
  private twoFactorAuthPending: {
    cookies: CookieJar;
    csrfToken: string;
    user: string;
    twoFactorId: string;
  } | null = null;

  constructor(options: InstaloaderContextOptions = {}) {
    this.userAgent = options.userAgent ?? defaultUserAgent();
    this.requestTimeout = options.requestTimeout ?? 300000;
    this.sleep = options.sleep ?? true;
    this.quiet = options.quiet ?? false;
    this.maxConnectionAttempts = options.maxConnectionAttempts ?? 3;
    this.iphoneSupport = options.iphoneSupport ?? true;
    this.iphoneHeaders = defaultIphoneHeaders();
    this.fatalStatusCodes = options.fatalStatusCodes ?? [];

    this.initAnonymousSession();

    this.rateController = options.rateController
      ? options.rateController(this)
      : new RateController(this);
  }

  private initAnonymousSession(): void {
    this.cookies = {
      sessionid: "",
      mid: "",
      ig_pr: "1",
      ig_vw: "1920",
      csrftoken: "",
      s_network: "",
      ds_user_id: "",
    };
    this.csrfToken = "";
  }

  get isLoggedIn(): boolean {
    return this.username !== null;
  }

  log(...msg: unknown[]): void {
    if (!this.quiet) {
      console.log(...msg);
    }
  }

  error(msg: string, repeatAtEnd = true): void {
    console.error(msg);
    if (repeatAtEnd) {
      this.errorLog.push(msg);
    }
  }

  get hasStoredErrors(): boolean {
    return this.errorLog.length > 0;
  }

  close(): void {
    if (this.errorLog.length > 0 && !this.quiet) {
      console.error("\nErrors or warnings occurred:");
      for (const err of this.errorLog) {
        console.error(err);
      }
    }
  }

  private defaultHttpHeaders(emptySessionOnly = false): Record<string, string> {
    const headers: Record<string, string> = {
      "Accept-Encoding": "gzip, deflate",
      "Accept-Language": "en-US,en;q=0.8",
      Connection: "keep-alive",
      "Content-Length": "0",
      Host: "www.instagram.com",
      Origin: "https://www.instagram.com",
      Referer: "https://www.instagram.com/",
      "User-Agent": this.userAgent,
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
  }

  private getCookieHeader(): string {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  private parseCookies(setCookieHeaders: string[]): void {
    for (const header of setCookieHeaders) {
      const match = header.match(/^([^=]+)=([^;]*)/);
      if (match) {
        const [, name, value] = match;
        if (name && value !== undefined) {
          this.cookies[name] = value;
        }
      }
    }
    if (this.cookies["csrftoken"]) {
      this.csrfToken = this.cookies["csrftoken"];
    }
  }

  saveSession(): CookieJar {
    return { ...this.cookies };
  }

  updateCookies(cookies: CookieJar): void {
    Object.assign(this.cookies, cookies);
  }

  loadSession(username: string, sessionData: CookieJar): void {
    this.cookies = { ...sessionData };
    this.csrfToken = sessionData["csrftoken"] ?? "";
    this.username = username;
  }

  async testLogin(): Promise<string | null> {
    try {
      const data = await this.graphqlQuery(
        "d6f4427fbe92d846298cf93df0b937d3",
        {},
      );
      const dataObj = data["data"] as Record<string, unknown> | undefined;
      const user = dataObj?.["user"] as Record<string, unknown> | undefined;
      return (user?.["username"] as string) ?? null;
    } catch (err) {
      if (
        err instanceof AbortDownloadException ||
        err instanceof ConnectionException
      ) {
        this.error(`Error when checking if logged in: ${err.message}`);
        return null;
      }
      throw err;
    }
  }

  async login(user: string, passwd: string): Promise<void> {
    this.initAnonymousSession();

    const initialResp = await this.fetchWithRetry(
      "https://www.instagram.com/",
      {
        headers: this.defaultHttpHeaders(true),
      },
    );

    const setCookies = initialResp.headers.getSetCookie();
    this.parseCookies(setCookies);

    await this.doSleep();

    const encPassword = `#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now() / 1000)}:${passwd}`;

    const loginHeaders = {
      ...this.defaultHttpHeaders(),
      "X-CSRFToken": this.csrfToken,
      Cookie: this.getCookieHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const loginBody = new URLSearchParams({
      enc_password: encPassword,
      username: user,
    });

    const loginResp = await this.fetchWithRetry(
      "https://www.instagram.com/api/v1/web/accounts/login/ajax/",
      {
        method: "POST",
        headers: loginHeaders,
        body: loginBody.toString(),
        redirect: "manual",
      },
    );

    this.parseCookies(loginResp.headers.getSetCookie());

    let respJson: Record<string, unknown>;
    try {
      respJson = (await loginResp.json()) as Record<string, unknown>;
    } catch {
      throw new LoginException(
        `Login error: JSON decode fail, ${loginResp.status} - ${loginResp.statusText}.`,
      );
    }

    if (respJson["two_factor_required"]) {
      const twoFactorInfo = respJson["two_factor_info"] as Record<
        string,
        unknown
      >;
      this.twoFactorAuthPending = {
        cookies: { ...this.cookies },
        csrfToken: this.csrfToken,
        user,
        twoFactorId: twoFactorInfo["two_factor_identifier"] as string,
      };
      throw new TwoFactorAuthRequiredException(
        "Login error: two-factor authentication required.",
        twoFactorInfo["two_factor_identifier"] as string,
      );
    }

    if (respJson["checkpoint_url"]) {
      throw new LoginException(
        `Login: Checkpoint required. Point your browser to ${respJson["checkpoint_url"]} - follow the instructions, then retry.`,
      );
    }

    if (respJson["status"] !== "ok") {
      const message = respJson["message"]
        ? `"${respJson["status"]}" status, message "${respJson["message"]}".`
        : `"${respJson["status"]}" status.`;
      throw new LoginException(`Login error: ${message}`);
    }

    if (!("authenticated" in respJson)) {
      const message = respJson["message"]
        ? `Unexpected response, "${respJson["message"]}".`
        : "Unexpected response, this might indicate a blocked IP.";
      throw new LoginException(`Login error: ${message}`);
    }

    if (!respJson["authenticated"]) {
      if (respJson["user"]) {
        throw new BadCredentialsException("Login error: Wrong password.");
      } else {
        throw new LoginException(
          `Login error: User ${user} does not exist.`,
        );
      }
    }

    this.username = user;
    this.userId = respJson["userId"] as string;
  }

  async twoFactorLogin(twoFactorCode: string): Promise<void> {
    if (!this.twoFactorAuthPending) {
      throw new InvalidArgumentException(
        "No two-factor authentication pending.",
      );
    }

    const { cookies, csrfToken, user, twoFactorId } = this.twoFactorAuthPending;
    this.cookies = cookies;
    this.csrfToken = csrfToken;

    const loginBody = new URLSearchParams({
      username: user,
      verificationCode: twoFactorCode,
      identifier: twoFactorId,
    });

    const loginResp = await this.fetchWithRetry(
      "https://www.instagram.com/accounts/login/ajax/two_factor/",
      {
        method: "POST",
        headers: {
          ...this.defaultHttpHeaders(),
          "X-CSRFToken": this.csrfToken,
          Cookie: this.getCookieHeader(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: loginBody.toString(),
        redirect: "manual",
      },
    );

    this.parseCookies(loginResp.headers.getSetCookie());

    const respJson = (await loginResp.json()) as Record<string, unknown>;

    if (respJson["status"] !== "ok") {
      const message = respJson["message"]
        ? `${respJson["message"]}`
        : `"${respJson["status"]}" status.`;
      throw new BadCredentialsException(`2FA error: ${message}`);
    }

    this.username = user;
    this.twoFactorAuthPending = null;
  }

  async doSleep(): Promise<void> {
    if (this.sleep) {
      const sleepTime = Math.min(-Math.log(Math.random()) / 0.6, 15.0);
      await new Promise((resolve) =>
        setTimeout(resolve, sleepTime * 1000),
      );
    }
  }

  private responseError(resp: Response, body?: string): string {
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
      }
    }

    return `${resp.status} ${resp.statusText}${extraFromJson ? ` - ${extraFromJson}` : ""} when accessing ${resp.url}`;
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.requestTimeout,
    );

    try {
      const resp = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return resp;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getJson(
    path: string,
    params: Record<string, string>,
    options: {
      host?: string;
      usePost?: boolean;
      attempt?: number;
    } = {},
  ): Promise<Record<string, unknown>> {
    const { host = "www.instagram.com", usePost = false, attempt = 1 } = options;

    const isGraphqlQuery =
      "query_hash" in params && path.includes("graphql/query");
    const isDocIdQuery = "doc_id" in params && path.includes("graphql/query");
    const isIphoneQuery = host === "i.instagram.com";
    const isOtherQuery =
      !isGraphqlQuery && !isDocIdQuery && host === "www.instagram.com";

    try {
      await this.doSleep();

      if (isGraphqlQuery) {
        await this.rateController.waitBeforeQuery(params["query_hash"]!);
      }
      if (isDocIdQuery) {
        await this.rateController.waitBeforeQuery(params["doc_id"]!);
      }
      if (isIphoneQuery) {
        await this.rateController.waitBeforeQuery("iphone");
      }
      if (isOtherQuery) {
        await this.rateController.waitBeforeQuery("other");
      }

      let url: string;
      let fetchOptions: RequestInit;

      const headers: Record<string, string> = {
        ...this.defaultHttpHeaders(true),
        authority: "www.instagram.com",
        scheme: "https",
        accept: "*/*",
        "X-CSRFToken": this.csrfToken,
        Cookie: this.getCookieHeader(),
      };
      delete headers["Connection"];
      delete headers["Content-Length"];

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

      const resp = await this.fetchWithRetry(url, fetchOptions);

      if (this.fatalStatusCodes.includes(resp.status)) {
        const body = await resp.text();
        throw new AbortDownloadException(
          `Query to ${url} responded with "${resp.status} ${resp.statusText}"${body ? `: ${body.slice(0, 500)}` : ""}`,
        );
      }

      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get("location");
        if (
          location?.startsWith("https://www.instagram.com/accounts/login") ||
          location?.startsWith("https://i.instagram.com/accounts/login")
        ) {
          if (!this.isLoggedIn) {
            throw new LoginRequiredException(
              "Redirected to login page. Use login() first.",
            );
          }
          throw new AbortDownloadException(
            "Redirected to login page. You've been logged out, please wait some time, recreate the session and try again",
          );
        }
      }

      const bodyText = await resp.text();

      if (resp.status === 400) {
        try {
          const respJson = JSON.parse(bodyText) as Record<string, unknown>;
          if (
            ["feedback_required", "checkpoint_required", "challenge_required"].includes(
              respJson["message"] as string,
            )
          ) {
            throw new AbortDownloadException(
              this.responseError(resp, bodyText),
            );
          }
        } catch (e) {
          if (e instanceof AbortDownloadException) throw e;
        }
        throw new QueryReturnedBadRequestException(
          this.responseError(resp, bodyText),
        );
      }

      if (resp.status === 404) {
        throw new QueryReturnedNotFoundException(
          this.responseError(resp, bodyText),
        );
      }

      if (resp.status === 429) {
        throw new TooManyRequestsException(this.responseError(resp, bodyText));
      }

      if (resp.status !== 200) {
        throw new ConnectionException(this.responseError(resp, bodyText));
      }

      const respJson = JSON.parse(bodyText) as Record<string, unknown>;

      if (respJson["status"] && respJson["status"] !== "ok") {
        throw new ConnectionException(this.responseError(resp, bodyText));
      }

      return respJson;
    } catch (err) {
      if (
        err instanceof InstaloaderException ||
        err instanceof AbortDownloadException
      ) {
        const errorString = `JSON Query to ${path}: ${err.message}`;

        if (attempt >= this.maxConnectionAttempts) {
          if (err instanceof QueryReturnedNotFoundException) {
            throw new QueryReturnedNotFoundException(errorString);
          }
          throw new ConnectionException(errorString);
        }

        this.error(`${errorString} [retrying]`, false);

        if (err instanceof TooManyRequestsException) {
          if (isGraphqlQuery) {
            await this.rateController.handle429(params["query_hash"]!);
          }
          if (isDocIdQuery) {
            await this.rateController.handle429(params["doc_id"]!);
          }
          if (isIphoneQuery) {
            await this.rateController.handle429("iphone");
          }
          if (isOtherQuery) {
            await this.rateController.handle429("other");
          }
        }

        return this.getJson(path, params, {
          host,
          usePost,
          attempt: attempt + 1,
        });
      }
      throw err;
    }
  }

  async graphqlQuery(
    queryHash: string,
    variables: Record<string, unknown>,
    referer?: string,
  ): Promise<Record<string, unknown>> {
    const params: Record<string, string> = {
      query_hash: queryHash,
      variables: JSON.stringify(variables),
    };

    if (referer) {
      void referer;
    }

    const respJson = await this.getJson("graphql/query", params);

    if (!("status" in respJson)) {
      this.error('GraphQL response did not contain a "status" field.');
    }

    return respJson;
  }

  async docIdGraphqlQuery(
    docId: string,
    variables: Record<string, unknown>,
    _referer?: string,
  ): Promise<Record<string, unknown>> {
    const params: Record<string, string> = {
      variables: JSON.stringify(variables),
      doc_id: docId,
      server_timestamps: "true",
    };

    const respJson = await this.getJson("graphql/query", params, {
      usePost: true,
    });

    if (!("status" in respJson)) {
      this.error('GraphQL response did not contain a "status" field.');
    }

    return respJson;
  }

  async getIphoneJson(
    path: string,
    params: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      ...this.iphoneHeaders,
      "ig-intended-user-id": this.userId ?? "",
      "x-pigeon-rawclienttime": (Date.now() / 1000).toFixed(6),
      Cookie: this.getCookieHeader(),
      "User-Agent": this.iphoneHeaders["User-Agent"] ?? defaultIphoneHeaders()["User-Agent"] ?? "",
    };

    const headerCookiesMapping: Record<string, string> = {
      "x-mid": "mid",
      "ig-u-ds-user-id": "ds_user_id",
      "x-ig-device-id": "ig_did",
      "x-ig-family-device-id": "ig_did",
      family_device_id: "ig_did",
    };

    for (const [headerKey, cookieKey] of Object.entries(headerCookiesMapping)) {
      if (this.cookies[cookieKey] && !headers[headerKey]) {
        headers[headerKey] = this.cookies[cookieKey];
      }
    }

    if (this.cookies["rur"] && !headers["ig-u-rur"]) {
      headers["ig-u-rur"] = this.cookies["rur"].replace(/"/g, "");
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

    const resp = await this.fetchWithRetry(url, {
      method: "GET",
      headers,
    });

    resp.headers.forEach((value, key) => {
      if (key.startsWith("ig-set-")) {
        this.iphoneHeaders[key.replace("ig-set-", "")] = value;
      } else if (key.startsWith("x-ig-set-")) {
        this.iphoneHeaders[key.replace("x-ig-set-", "x-ig-")] = value;
      }
    });

    const bodyText = await resp.text();
    
    if (resp.status === 404) {
      throw new QueryReturnedNotFoundException(
        this.responseError(resp, bodyText),
      );
    }

    if (resp.status !== 200) {
      throw new ConnectionException(this.responseError(resp, bodyText));
    }

    try {
      return JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      throw new BadResponseException(
        `Failed to parse JSON response from ${url}: ${bodyText.slice(0, 200)}`,
      );
    }
  }

  async getRaw(url: string): Promise<Response> {
    const resp = await this.fetchWithRetry(url, {
      method: "GET",
      headers: this.defaultHttpHeaders(true),
    });

    if (resp.status === 200) {
      return resp;
    }

    if (resp.status === 403) {
      throw new QueryReturnedForbiddenException(
        this.responseError(resp),
      );
    }

    if (resp.status === 404) {
      throw new QueryReturnedNotFoundException(this.responseError(resp));
    }

    throw new ConnectionException(this.responseError(resp));
  }

  async head(url: string, allowRedirects = false): Promise<Response> {
    const resp = await this.fetchWithRetry(url, {
      method: "HEAD",
      headers: this.defaultHttpHeaders(true),
      redirect: allowRedirects ? "follow" : "manual",
    });

    if (resp.status === 200) {
      return resp;
    }

    if (resp.status === 403) {
      throw new QueryReturnedForbiddenException(this.responseError(resp));
    }

    if (resp.status === 404) {
      throw new QueryReturnedNotFoundException(this.responseError(resp));
    }

    throw new ConnectionException(this.responseError(resp));
  }
}

export class RateController {
  private context: InstaloaderContext;
  private queryTimestamps: Map<string, number[]> = new Map();
  private earliestNextRequestTime = 0;
  private iphoneEarliestNextRequestTime = 0;

  constructor(context: InstaloaderContext) {
    this.context = context;
  }

  async sleep(secs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, secs * 1000));
  }

  countPerSlidingWindow(queryType: string): number {
    return queryType === "other" ? 75 : 200;
  }

  private reqsInSlidingWindow(
    queryType: string | null,
    currentTime: number,
    window: number,
  ): number[] {
    if (queryType !== null) {
      const timestamps = this.queryTimestamps.get(queryType) ?? [];
      return timestamps.filter((t) => t > currentTime - window);
    }

    const allTimestamps: number[] = [];
    for (const [type, timestamps] of this.queryTimestamps.entries()) {
      if (type !== "iphone" && type !== "other") {
        allTimestamps.push(
          ...timestamps.filter((t) => t > currentTime - window),
        );
      }
    }
    return allTimestamps;
  }

  queryWaittime(
    queryType: string,
    currentTime: number,
    untrackedQueries = false,
  ): number {
    const perTypeSlidingWindow = 660;
    const iphoneSlidingWindow = 1800;

    if (!this.queryTimestamps.has(queryType)) {
      this.queryTimestamps.set(queryType, []);
    }

    const timestamps = this.queryTimestamps.get(queryType)!;
    this.queryTimestamps.set(
      queryType,
      timestamps.filter((t) => t > currentTime - 3600),
    );

    const perTypeNextRequestTime = (): number => {
      const reqs = this.reqsInSlidingWindow(
        queryType,
        currentTime,
        perTypeSlidingWindow,
      );
      if (reqs.length < this.countPerSlidingWindow(queryType)) {
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
      const reqs = this.reqsInSlidingWindow(
        null,
        currentTime,
        gqlAccumulatedSlidingWindow,
      );
      if (reqs.length < gqlAccumulatedMaxCount) {
        return 0;
      }
      return Math.min(...reqs) + gqlAccumulatedSlidingWindow;
    };

    const untrackedNextRequestTime = (): number => {
      if (untrackedQueries) {
        if (queryType === "iphone") {
          const reqs = this.reqsInSlidingWindow(
            queryType,
            currentTime,
            iphoneSlidingWindow,
          );
          if (reqs.length > 0) {
            this.iphoneEarliestNextRequestTime =
              Math.min(...reqs) + iphoneSlidingWindow + 18;
          }
        } else {
          const reqs = this.reqsInSlidingWindow(
            queryType,
            currentTime,
            perTypeSlidingWindow,
          );
          if (reqs.length > 0) {
            this.earliestNextRequestTime =
              Math.min(...reqs) + perTypeSlidingWindow + 6;
          }
        }
      }
      return Math.max(
        this.iphoneEarliestNextRequestTime,
        this.earliestNextRequestTime,
      );
    };

    const iphoneNextRequest = (): number => {
      if (queryType === "iphone") {
        const reqs = this.reqsInSlidingWindow(
          queryType,
          currentTime,
          iphoneSlidingWindow,
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
        iphoneNextRequest(),
      ) - currentTime,
    );
  }

  async waitBeforeQuery(queryType: string): Promise<void> {
    const currentTime = performance.now() / 1000;
    const waittime = this.queryWaittime(queryType, currentTime, false);

    if (waittime > 15) {
      const formatted =
        waittime <= 666
          ? `${Math.round(waittime)} seconds`
          : `${Math.round(waittime / 60)} minutes`;
      const resumeTime = new Date(Date.now() + waittime * 1000);
      this.context.log(
        `\nToo many queries in the last time. Need to wait ${formatted}, until ${resumeTime.toLocaleTimeString()}.`,
      );
    }

    if (waittime > 0) {
      await this.sleep(waittime);
    }

    const timestamps = this.queryTimestamps.get(queryType) ?? [];
    timestamps.push(performance.now() / 1000);
    this.queryTimestamps.set(queryType, timestamps);
  }

  async handle429(queryType: string): Promise<void> {
    const currentTime = performance.now() / 1000;
    const waittime = this.queryWaittime(queryType, currentTime, true);

    this.context.error(
      'Instagram responded with HTTP error "429 - Too Many Requests". Please do not run multiple instances of Instaloader in parallel or within short sequence.',
      false,
    );

    if (waittime > 1.5) {
      const formatted =
        waittime <= 666
          ? `${Math.round(waittime)} seconds`
          : `${Math.round(waittime / 60)} minutes`;
      const resumeTime = new Date(Date.now() + waittime * 1000);
      this.context.error(
        `The request will be retried in ${formatted}, at ${resumeTime.toLocaleTimeString()}.`,
        false,
      );
    }

    if (waittime > 0) {
      await this.sleep(waittime);
    }
  }
}
