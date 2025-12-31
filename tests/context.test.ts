import { describe, test, expect } from "bun:test";
import { Effect, Ref } from "effect";
import {
  makeInstaloaderContext,
  defaultUserAgent,
  defaultIphoneHeaders,
  type InstaloaderContextShape,
} from "../src/index.ts";

describe("InstaloaderContext", () => {
  describe("defaultUserAgent", () => {
    test("returns a valid user agent string", () => {
      const ua = defaultUserAgent();
      expect(typeof ua).toBe("string");
      expect(ua.length).toBeGreaterThan(0);
      expect(ua).toContain("Mozilla");
    });
  });

  describe("defaultIphoneHeaders", () => {
    test("returns headers object", () => {
      const headers = defaultIphoneHeaders();
      expect(typeof headers).toBe("object");
      expect(headers["User-Agent"]).toContain("Instagram");
      expect(headers["x-ig-app-id"]).toBeDefined();
    });

    test("generates random connection speed", () => {
      const headers1 = defaultIphoneHeaders();
      const headers2 = defaultIphoneHeaders();
      expect(headers1["x-ig-connection-speed"]).toMatch(/\d+kbps/);
      expect(headers2["x-ig-connection-speed"]).toMatch(/\d+kbps/);
    });

    test("generates unique pigeon session id", () => {
      const headers1 = defaultIphoneHeaders();
      const headers2 = defaultIphoneHeaders();
      expect(headers1["x-pigeon-session-id"]).toBeDefined();
      expect(headers2["x-pigeon-session-id"]).toBeDefined();
      expect(headers1["x-pigeon-session-id"]).not.toBe(
        headers2["x-pigeon-session-id"],
      );
    });
  });

  describe("makeInstaloaderContext", () => {
    const runWithContext = <A>(
      fn: (ctx: InstaloaderContextShape) => Effect.Effect<A>
    ): Promise<A> =>
      Effect.runPromise(
        Effect.gen(function* () {
          const ctx = yield* makeInstaloaderContext();
          return yield* fn(ctx);
        })
      );

    test("creates context with default options", async () => {
      await runWithContext((ctx) =>
        Effect.gen(function* () {
          expect(ctx.options.userAgent).toBe(defaultUserAgent());
          expect(ctx.options.sleep).toBe(true);
          expect(ctx.options.quiet).toBe(false);
          expect(ctx.options.maxConnectionAttempts).toBe(3);
          expect(ctx.options.iphoneSupport).toBe(true);
          const isLoggedIn = yield* ctx.isLoggedIn;
          expect(isLoggedIn).toBe(false);
          const username = yield* ctx.getUsername;
          expect(username).toBeNull();
        })
      );
    });

    test("creates context with custom options", async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const ctx = yield* makeInstaloaderContext({
            userAgent: "CustomAgent/1.0",
            sleep: false,
            quiet: true,
            maxConnectionAttempts: 5,
            iphoneSupport: false,
            requestTimeout: 60000,
          });
          expect(ctx.options.userAgent).toBe("CustomAgent/1.0");
          expect(ctx.options.sleep).toBe(false);
          expect(ctx.options.quiet).toBe(true);
          expect(ctx.options.maxConnectionAttempts).toBe(5);
          expect(ctx.options.iphoneSupport).toBe(false);
          expect(ctx.options.requestTimeout).toBe(60000);
        })
      );
    });

    test("isLoggedIn returns false initially", async () => {
      await runWithContext((ctx) =>
        Effect.gen(function* () {
          const isLoggedIn = yield* ctx.isLoggedIn;
          expect(isLoggedIn).toBe(false);
        })
      );
    });

    test("saveSession returns cookies", async () => {
      await runWithContext((ctx) =>
        Effect.gen(function* () {
          const session = yield* ctx.saveSession;
          expect(typeof session).toBe("object");
          expect(session).toHaveProperty("sessionid");
        })
      );
    });

    test("loadSession restores session", async () => {
      await runWithContext((ctx) =>
        Effect.gen(function* () {
          const sessionData = {
            sessionid: "test123",
            csrftoken: "csrf456",
            mid: "mid789",
          };
          yield* ctx.loadSession("testuser", sessionData);
          const username = yield* ctx.getUsername;
          expect(username).toBe("testuser");
          const isLoggedIn = yield* ctx.isLoggedIn;
          expect(isLoggedIn).toBe(true);
        })
      );
    });

    test("hasStoredErrors returns false initially", async () => {
      await runWithContext((ctx) =>
        Effect.gen(function* () {
          const hasErrors = yield* ctx.hasStoredErrors;
          expect(hasErrors).toBe(false);
        })
      );
    });

    test("error logs messages with repeatAtEnd=true", async () => {
      await runWithContext((ctx) =>
        Effect.gen(function* () {
          yield* ctx.error("test error", true);
          const hasErrors = yield* ctx.hasStoredErrors;
          expect(hasErrors).toBe(true);
          const state = yield* Ref.get(ctx.stateRef);
          expect(state.errorLog).toContain("test error");
        })
      );
    });

    test("error with repeatAtEnd=false does not store", async () => {
      await runWithContext((ctx) =>
        Effect.gen(function* () {
          yield* ctx.error("transient error", false);
          const state = yield* Ref.get(ctx.stateRef);
          expect(state.errorLog).not.toContain("transient error");
        })
      );
    });
  });
});
