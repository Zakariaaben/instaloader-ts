import { describe, test, expect } from "bun:test";
import {
  formatStringContainsKey,
} from "../src/index.ts";

describe("Instaloader", () => {
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
