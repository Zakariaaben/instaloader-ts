import { describe, test, expect } from "bun:test";
import {
  InstaloaderContext,
  defaultUserAgent,
  defaultIphoneHeaders,
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

  describe("InstaloaderContext", () => {
    test("creates context with default options", () => {
      const ctx = new InstaloaderContext();
      expect(ctx.userAgent).toBe(defaultUserAgent());
      expect(ctx.sleep).toBe(true);
      expect(ctx.quiet).toBe(false);
      expect(ctx.maxConnectionAttempts).toBe(3);
      expect(ctx.iphoneSupport).toBe(true);
      expect(ctx.isLoggedIn).toBe(false);
      expect(ctx.username).toBeNull();
      ctx.close();
    });

    test("creates context with custom options", () => {
      const ctx = new InstaloaderContext({
        userAgent: "CustomAgent/1.0",
        sleep: false,
        quiet: true,
        maxConnectionAttempts: 5,
        iphoneSupport: false,
        requestTimeout: 60000,
      });
      expect(ctx.userAgent).toBe("CustomAgent/1.0");
      expect(ctx.sleep).toBe(false);
      expect(ctx.quiet).toBe(true);
      expect(ctx.maxConnectionAttempts).toBe(5);
      expect(ctx.iphoneSupport).toBe(false);
      expect(ctx.requestTimeout).toBe(60000);
      ctx.close();
    });

    test("isLoggedIn returns false initially", () => {
      const ctx = new InstaloaderContext();
      expect(ctx.isLoggedIn).toBe(false);
      ctx.close();
    });

    test("saveSession returns cookies", () => {
      const ctx = new InstaloaderContext();
      const session = ctx.saveSession();
      expect(typeof session).toBe("object");
      expect(session).toHaveProperty("sessionid");
      ctx.close();
    });

    test("loadSession restores session", () => {
      const ctx = new InstaloaderContext();
      const sessionData = {
        sessionid: "test123",
        csrftoken: "csrf456",
        mid: "mid789",
      };
      ctx.loadSession("testuser", sessionData);
      expect(ctx.username).toBe("testuser");
      expect(ctx.isLoggedIn).toBe(true);
      ctx.close();
    });

    test("hasStoredErrors returns false initially", () => {
      const ctx = new InstaloaderContext();
      expect(ctx.hasStoredErrors).toBe(false);
      ctx.close();
    });

    test("error logs messages", () => {
      const ctx = new InstaloaderContext();
      ctx.error("test error", true);
      expect(ctx.hasStoredErrors).toBe(true);
      expect(ctx.errorLog).toContain("test error");
      ctx.close();
    });

    test("error with repeatAtEnd=false does not store", () => {
      const ctx = new InstaloaderContext();
      ctx.error("transient error", false);
      expect(ctx.errorLog).not.toContain("transient error");
      ctx.close();
    });
  });
});
