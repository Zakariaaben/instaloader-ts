import { describe, test, expect } from "bun:test";
import {
  getDefaultSessionFilename,
  formatStringContainsKey,
} from "../src/index.ts";

describe("Instaloader", () => {
  describe("getDefaultSessionFilename", () => {
    test("returns path containing username", () => {
      const filename = getDefaultSessionFilename("testuser");
      expect(filename).toContain("testuser");
      expect(filename).toContain("session-");
    });

    test("returns consistent path for same username", () => {
      const filename1 = getDefaultSessionFilename("testuser");
      const filename2 = getDefaultSessionFilename("testuser");
      expect(filename1).toBe(filename2);
    });

    test("returns different paths for different usernames", () => {
      const filename1 = getDefaultSessionFilename("user1");
      const filename2 = getDefaultSessionFilename("user2");
      expect(filename1).not.toBe(filename2);
    });
  });

  describe("formatStringContainsKey", () => {
    test("returns true for format string containing key", () => {
      expect(formatStringContainsKey("{profile}_post", "profile")).toBe(true);
    });

    test("returns false for format string not containing key", () => {
      expect(formatStringContainsKey("{target}_post", "profile")).toBe(false);
    });

    test("returns true for format string with dotted key", () => {
      expect(formatStringContainsKey("{profile.name}_post", "profile")).toBe(
        true,
      );
    });

    test("returns false for partial key match", () => {
      expect(formatStringContainsKey("{profile_name}", "profile")).toBe(false);
    });
  });
});
