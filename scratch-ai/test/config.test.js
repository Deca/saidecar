import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import {
  expandHome,
  validateConfig,
  APP_BRAND,
  APP_DISPLAY_NAME,
  APP_HOME,
  LEGACY_LOG_DIR,
  DEFAULT_LOG_DIR,
  resolveDefaultLogDir,
} from "../src/config.js";

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

test("brand constants are exposed and consistent", () => {
  assert.equal(APP_BRAND, "saidecar");
  assert.equal(APP_DISPLAY_NAME, "sAIdecar");
  assert.ok(APP_HOME.endsWith(path.join(`.${APP_BRAND}`)));
  assert.equal(LEGACY_LOG_DIR, path.join(os.homedir(), "dev-brain", "inbox"));
  assert.equal(DEFAULT_LOG_DIR, path.join(os.homedir(), ".saidecar", "logs"));
});

test("resolveDefaultLogDir returns new default when no legacy dir exists", () => {
  const result = resolveDefaultLogDir(() => false);
  assert.equal(result, DEFAULT_LOG_DIR);
});

test("resolveDefaultLogDir keeps legacy dir when it exists on disk", () => {
  const result = resolveDefaultLogDir(() => true);
  assert.equal(result, LEGACY_LOG_DIR);
});

test("validateConfig accepts SAIDECAR_BACKEND in addition to SCRATCH_AI_BACKEND", () => {
  delete process.env.SCRATCH_AI_BACKEND;
  process.env.SAIDECAR_BACKEND = "codex";
  process.env.SAIDECAR_CODEX_TIMEOUT_MS = "5000";
  delete process.env.OPENAI_API_KEY;

  assert.doesNotThrow(() => validateConfig());
});