import test from "node:test";
import assert from "node:assert/strict";
import { expandHome, validateConfig } from "../src/config.js";

test("expandHome returns empty string as-is", () => {
  assert.equal(expandHome(""), "");
  assert.equal(expandHome(null), null);
  assert.equal(expandHome(undefined), undefined);
});

test("expandHome expands ~ to homedir", () => {
  const result = expandHome("~");
  assert.ok(result.endsWith("ai-sidecar") || result.includes("User") || result.includes("home"));
});

test("expandHome expands ~/ paths", () => {
  const result = expandHome("~/some/path");
  assert.ok(result.includes("some") || result.includes("path"));
  assert.ok(!result.startsWith("~"));
});

test("expandHome leaves regular paths unchanged", () => {
  assert.equal(expandHome("/absolute/path"), "/absolute/path");
  assert.equal(expandHome("relative/path"), "relative/path");
});

test("validateConfig does not throw for codex backend without API key", () => {
  process.env.SCRATCH_AI_BACKEND = "codex";
  delete process.env.OPENAI_API_KEY;
  process.env.SCRATCH_AI_CODEX_TIMEOUT_MS = "5000";

  assert.doesNotThrow(() => validateConfig());
});

test("validateConfig accepts openai backend with valid API key", () => {
  process.env.SCRATCH_AI_BACKEND = "openai";
  process.env.OPENAI_API_KEY = "test-key-123";

  assert.doesNotThrow(() => validateConfig());
});

test("validateConfig accepts codex backend", () => {
  process.env.SCRATCH_AI_BACKEND = "codex";
  delete process.env.OPENAI_API_KEY;
  process.env.SCRATCH_AI_CODEX_TIMEOUT_MS = "5000";

  assert.doesNotThrow(() => validateConfig());
});