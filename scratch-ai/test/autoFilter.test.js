import { describe, it, mock } from "node:test";
import assert from "node:assert";
import {
  scoreEntry,
  formatAutoFilterMetadata,
  FILTER_DECISION_KEEP,
  FILTER_DECISION_CONDENSE,
  FILTER_DECISION_DISCARD,
} from "../src/autoFilter.js";

describe("autoFilter", () => {
  describe("FILTER_DECISION_* constants", () => {
    it("are defined", () => {
      assert.strictEqual(FILTER_DECISION_KEEP, "keep");
      assert.strictEqual(FILTER_DECISION_CONDENSE, "condense");
      assert.strictEqual(FILTER_DECISION_DISCARD, "discard");
    });
  });

  describe("formatAutoFilterMetadata", () => {
    it("returns null for null input", () => {
      assert.strictEqual(formatAutoFilterMetadata(null), null);
    });

    it("formats valid filter result", () => {
      const input = {
        decision: FILTER_DECISION_KEEP,
        reason: "contains code",
        condensedText: null,
      };
      const result = formatAutoFilterMetadata(input);
      assert.deepStrictEqual(result, input);
    });

    it("formats condense result with condensed text", () => {
      const input = {
        decision: FILTER_DECISION_CONDENSE,
        reason: "simple question",
        condensedText: "Use itertools for permutations",
      };
      const result = formatAutoFilterMetadata(input);
      assert.deepStrictEqual(result, input);
    });
  });

  describe("scoreEntry", () => {
    it("returns null when auto-filter is disabled", async () => {
      const originalEnv = process.env.SCRATCH_AI_AUTO_FILTER;
      process.env.SCRATCH_AI_AUTO_FILTER = "false";

      try {
        const result = await scoreEntry({
          question: "test",
          answer: "test answer",
          mode: "normal",
          model: "gpt-4o-mini",
        });
        assert.strictEqual(result, null);
      } finally {
        process.env.SCRATCH_AI_AUTO_FILTER = originalEnv;
      }
    });
  });
});