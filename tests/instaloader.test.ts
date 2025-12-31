import { describe, test, expect } from "bun:test";
import {
  Instaloader,
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

  describe("Instaloader class", () => {
    test("creates instance with default options", () => {
      const L = new Instaloader();
      expect(L.context).toBeDefined();
      expect(L.downloadPictures).toBe(true);
      expect(L.downloadVideos).toBe(true);
      expect(L.downloadVideoThumbnails).toBe(true);
      expect(L.downloadGeotags).toBe(false);
      expect(L.downloadComments).toBe(false);
      expect(L.saveMetadata).toBe(true);
      expect(L.compressJson).toBe(true);
      expect(L.dirnamePattern).toBe("{target}");
      expect(L.filenamePattern).toBe("{date_utc}_UTC");
      L.close();
    });

    test("creates instance with custom options", () => {
      const L = new Instaloader({
        downloadPictures: false,
        downloadVideos: false,
        downloadGeotags: true,
        saveMetadata: false,
        dirnamePattern: "{profile}",
        filenamePattern: "{shortcode}",
      });
      expect(L.downloadPictures).toBe(false);
      expect(L.downloadVideos).toBe(false);
      expect(L.downloadGeotags).toBe(true);
      expect(L.saveMetadata).toBe(false);
      expect(L.dirnamePattern).toBe("{profile}");
      expect(L.filenamePattern).toBe("{shortcode}");
      L.close();
    });

    test("slide parameter parsing - single number", () => {
      const L = new Instaloader({ slide: "3" });
      expect(L.slideStart).toBe(2);
      expect(L.slideEnd).toBe(2);
      L.close();
    });

    test("slide parameter parsing - last", () => {
      const L = new Instaloader({ slide: "last" });
      expect(L.slideStart).toBe(-1);
      L.close();
    });

    test("slide parameter parsing - range", () => {
      const L = new Instaloader({ slide: "2-5" });
      expect(L.slideStart).toBe(1);
      expect(L.slideEnd).toBe(4);
      L.close();
    });

    test("slide parameter parsing - range to last", () => {
      const L = new Instaloader({ slide: "3-last" });
      expect(L.slideStart).toBe(2);
      L.close();
    });

    test("hasStoredErrors delegates to context", () => {
      const L = new Instaloader();
      expect(L.hasStoredErrors).toBe(false);
      L.context.error("test", true);
      expect(L.hasStoredErrors).toBe(true);
      L.close();
    });

    test("close calls context.close", () => {
      const L = new Instaloader();
      L.close();
    });
  });
});
