import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { refreshIndex, searchEntries } from "../src/logIndex.js";

function makeTempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scratch-ai-logs-"));
  return {
    root,
    logDir: path.join(root, "inbox"),
    indexPath: path.join(root, "scratch-ai.sqlite"),
  };
}

function writeJsonl(file, entries) {
  fs.writeFileSync(file, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

test("refreshIndex indexes valid entries and skips unchanged files", () => {
  const { root, logDir, indexPath } = makeTempPaths();
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "2026-06-01.jsonl");

  writeJsonl(logFile, [
    {
      timestamp: "2026-06-01T10:00:00.000Z",
      project: "demo",
      backend: "codex",
      mode: "normal",
      model: "gpt-5.4-mini",
      question: "How do I search logs?",
      answer: "Use SQLite FTS.",
    },
  ]);

  const first = refreshIndex({ logDir, indexPath });
  assert.equal(first.indexedFiles, 1);
  assert.equal(first.indexedEntries, 1);
  assert.equal(first.malformedLines, 0);

  const second = refreshIndex({ logDir, indexPath });
  assert.equal(second.skippedFiles, 1);
  assert.equal(second.indexedEntries, 0);

  const results = searchEntries({ query: "SQLite", indexPath });
  assert.equal(results.length, 1);
  assert.equal(results[0].question, "How do I search logs?");

  fs.rmSync(root, { recursive: true, force: true });
});

test("refreshIndex replays changed files and counts malformed lines", () => {
  const { root, logDir, indexPath } = makeTempPaths();
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "2026-06-01.jsonl");

  fs.writeFileSync(
    logFile,
    [
      JSON.stringify({
        timestamp: "2026-06-01T10:00:00.000Z",
        project: "demo",
        backend: "openai",
        mode: "web",
        question: "Find citations",
        answer: "Source: [Docs](https://example.com/docs)",
      }),
      "{not json}",
      JSON.stringify({
        timestamp: "2026-06-01T10:02:00.000Z",
        project: "demo",
        backend: "openai",
        mode: "think",
        question: "Plan memory",
        answer: "Promote important facts later.",
      }),
      "",
    ].join("\n")
  );

  const stats = refreshIndex({ logDir, indexPath });
  assert.equal(stats.indexedEntries, 2);
  assert.equal(stats.malformedLines, 1);

  assert.equal(searchEntries({ query: "citations", indexPath }).length, 1);
  assert.equal(searchEntries({ query: "example.com", indexPath }).length, 1);
  assert.equal(searchEntries({ mode: "think", indexPath }).length, 1);

  writeJsonl(logFile, [
    {
      timestamp: "2026-06-01T11:00:00.000Z",
      project: "demo",
      backend: "codex",
      mode: "normal",
      question: "Changed file",
      answer: "Only this entry should remain.",
    },
  ]);

  const changed = refreshIndex({ logDir, indexPath });
  assert.equal(changed.indexedFiles, 1);
  assert.equal(searchEntries({ query: "citations", indexPath }).length, 0);
  assert.equal(searchEntries({ query: "Changed", indexPath }).length, 1);

  fs.rmSync(root, { recursive: true, force: true });
});
