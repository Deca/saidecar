import test from "node:test";
import assert from "node:assert/strict";
import { extractSources, parseJsonlLine } from "../src/logParser.js";

test("parseJsonlLine normalizes a valid entry", () => {
  const { entry, error } = parseJsonlLine(
    JSON.stringify({
      timestamp: "2026-06-01T10:00:00.000Z",
      project: "demo",
      backend: "codex",
      mode: "web",
      model: "gpt-5.4-mini",
      question: "Find SQLite docs",
      answer: "Use FTS5.",
      durationMs: 1234,
      usage: { input_tokens: 10 },
    }),
    { logFile: "2026-06-01.jsonl", lineNumber: 7 }
  );

  assert.equal(error, null);
  assert.equal(entry.logFile, "2026-06-01.jsonl");
  assert.equal(entry.lineNumber, 7);
  assert.equal(entry.project, "demo");
  assert.equal(entry.backend, "codex");
  assert.equal(entry.mode, "web");
  assert.equal(entry.question, "Find SQLite docs");
  assert.equal(entry.durationMs, 1234);
  assert.deepEqual(JSON.parse(entry.usageJson), { input_tokens: 10 });
});

test("parseJsonlLine tolerates malformed lines", () => {
  const { entry, error } = parseJsonlLine("{bad json", {
    logFile: "bad.jsonl",
    lineNumber: 2,
  });

  assert.equal(entry, null);
  assert.equal(error.logFile, "bad.jsonl");
  assert.equal(error.lineNumber, 2);
  assert.match(error.message, /json/i);
});

test("extractSources reads markdown links, numbered sources, and raw citations", () => {
  const sources = extractSources({
    answer:
      "See [SQLite FTS5](https://sqlite.org/fts5.html).\n1. OpenAI: https://openai.com/news.",
    raw: {
      citations: [
        {
          title: "Codex",
          url: "https://openai.com/codex",
        },
      ],
    },
  });

  assert.deepEqual(
    sources.map((source) => source.url).sort(),
    [
      "https://openai.com/codex",
      "https://openai.com/news.",
      "https://sqlite.org/fts5.html",
    ]
  );
});
