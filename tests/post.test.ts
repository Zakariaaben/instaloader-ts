import { describe, test, expect } from "bun:test";
import {
  shortcodeToMediaidSync,
  mediaidToShortcodeSync,
  postSupportedGraphqlTypes,
} from "../src/structures/index.ts";

describe("Post", () => {
  describe("shortcodeToMediaid", () => {
    test("converts valid shortcode to mediaid", () => {
      expect(shortcodeToMediaidSync("BnGVSUvFfTM")).toBe(1857265514529027276n);
    });

    test("converts short shortcode", () => {
      expect(shortcodeToMediaidSync("B")).toBe(1n);
    });

    test("converts single character shortcode", () => {
      expect(shortcodeToMediaidSync("A")).toBe(0n);
    });

    test("throws for shortcode longer than 11 characters", () => {
      expect(() => shortcodeToMediaidSync("AAAAAAAAAAAA")).toThrow(
        "Wrong shortcode",
      );
    });
  });

  describe("mediaidToShortcode", () => {
    test("converts valid mediaid to shortcode", () => {
      expect(mediaidToShortcodeSync(1857265514529027276n)).toBe("BnGVSUvFfTM");
    });

    test("converts small mediaid", () => {
      expect(mediaidToShortcodeSync(1n)).toBe("B");
    });

    test("converts zero mediaid", () => {
      expect(mediaidToShortcodeSync(0n)).toBe("A");
    });

    test("throws for negative mediaid", () => {
      expect(() => mediaidToShortcodeSync(-1n)).toThrow("Wrong mediaid");
    });
  });

  describe("roundtrip conversion", () => {
    test("mediaid -> shortcode -> mediaid preserves value for small numbers", () => {
      const testCases = [0n, 1n, 64n, 100n, 1000n, 10000n, 100000n];
      for (const original of testCases) {
        const shortcode = mediaidToShortcodeSync(original);
        const result = shortcodeToMediaidSync(shortcode);
        expect(result).toBe(original);
      }
    });

    test("shortcode -> mediaid -> shortcode preserves value", () => {
      const testCases = ["BnGVSUvFfTM", "B", "CX", "abc123"];
      for (const original of testCases) {
        const mediaid = shortcodeToMediaidSync(original);
        const result = mediaidToShortcodeSync(mediaid);
        expect(result).toBe(original);
      }
    });
  });

  describe("supportedGraphqlTypes", () => {
    test("returns correct types", () => {
      const types = postSupportedGraphqlTypes();
      expect(types).toContain("GraphImage");
      expect(types).toContain("GraphVideo");
      expect(types).toContain("GraphSidecar");
      expect(types).toHaveLength(3);
    });
  });
});
