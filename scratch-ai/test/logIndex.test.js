import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { appendAnnotation } from "../src/annotations.js";
import { getFilterOptions, openLogIndex, refreshIndex, searchEntries } from "../src/logIndex.js";

function makeTempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "saidecar-logs-"));
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

test("searchEntries overlays annotation favorite and tag filters", () => {
  const { root, logDir, indexPath } = makeTempPaths();
  const annotationDir = path.join(root, "annotations");
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "2026-06-01.jsonl");

  writeJsonl(logFile, [
    {
      timestamp: "2026-06-01T10:00:00.000Z",
      project: "demo",
      backend: "codex",
      mode: "normal",
      question: "How do I restart queues?",
      answer: "Use queue:restart.",
    },
    {
      timestamp: "2026-06-01T10:10:00.000Z",
      project: "demo",
      backend: "codex",
      mode: "normal",
      question: "Random thought",
      answer: "Disposable.",
    },
  ]);

  refreshIndex({ logDir, indexPath });
  appendAnnotation({
    annotationDir,
    entryRef: { logFile, lineNumber: 1 },
    favorite: true,
    tags: ["laravel"],
  });

  const saved = searchEntries({ saved: true, indexPath, annotationDir });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].favorite, true);
  assert.deepEqual(saved[0].tags, ["laravel"]);

  const tagged = searchEntries({ tag: "laravel", indexPath, annotationDir });
  assert.equal(tagged.length, 1);
  assert.equal(tagged[0].question, "How do I restart queues?");

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

test("refreshIndex extracts and exposes structured fields", () => {
  const { root, logDir, indexPath } = makeTempPaths();
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "2026-06-01.jsonl");

  writeJsonl(logFile, [
    {
      timestamp: "2026-06-01T10:00:00.000Z",
      project: "iron-anchor",
      backend: "codex",
      mode: "normal",
      question: "How do I add a column? #iron-anchor",
      answer: "Use this:\n```sql\nALTER TABLE x ADD COLUMN y TEXT;\n```\nWe decided to ship this in v2.",
    },
    {
      timestamp: "2026-06-01T10:10:00.000Z",
      project: "nq-trader",
      backend: "openai",
      mode: "normal",
      question: "What is FTS5?",
      answer: "Full text search for SQLite.",
    },
  ]);

  refreshIndex({ logDir, indexPath });

  const all = searchEntries({ indexPath });
  assert.equal(all.length, 2);

  const code = all.find((e) => e.question.startsWith("How do I add"));
  assert.equal(code.isCodeSnippet, true);
  assert.equal(code.isDecision, true);
  assert.equal(code.language, "sql");
  assert.equal(code.topic, "iron-anchor");
  assert.equal(code.importance, "high");

  const trivia = all.find((e) => e.question.startsWith("What is FTS5"));
  assert.equal(trivia.isCodeSnippet, false);
  assert.equal(trivia.isDecision, false);
  assert.equal(trivia.language, null);
  assert.equal(trivia.topic, "nq-trader");
  assert.equal(trivia.importance, "low");

  fs.rmSync(root, { recursive: true, force: true });
});

test("searchEntries supports structured filters", () => {
  const { root, logDir, indexPath } = makeTempPaths();
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "2026-06-01.jsonl");

  writeJsonl(logFile, [
    {
      timestamp: "2026-06-01T10:00:00.000Z",
      project: "iron-anchor",
      backend: "codex",
      mode: "normal",
      question: "Decision question? #iron-anchor",
      answer: "```python\nprint('hi')\n```\nWe decided to do this.",
    },
    {
      timestamp: "2026-06-01T10:10:00.000Z",
      project: "nq-trader",
      backend: "openai",
      mode: "normal",
      question: "Plain question",
      answer: "Just some text.",
    },
  ]);

  refreshIndex({ logDir, indexPath });

  assert.equal(searchEntries({ importance: "high", indexPath }).length, 1);
  assert.equal(searchEntries({ importance: "low", indexPath }).length, 1);
  assert.equal(searchEntries({ importance: "all", indexPath }).length, 2);

  assert.equal(searchEntries({ topic: "iron-anchor", indexPath }).length, 1);
  assert.equal(searchEntries({ topic: "nq-trader", indexPath }).length, 1);
  assert.equal(searchEntries({ topic: "missing", indexPath }).length, 0);

  assert.equal(searchEntries({ language: "python", indexPath }).length, 1);
  assert.equal(searchEntries({ language: "rust", indexPath }).length, 0);

  assert.equal(searchEntries({ codeOnly: true, indexPath }).length, 1);
  assert.equal(searchEntries({ decisionOnly: true, indexPath }).length, 1);
  assert.equal(searchEntries({ codeOnly: true, decisionOnly: true, indexPath }).length, 1);

  fs.rmSync(root, { recursive: true, force: true });
});

test("getFilterOptions returns topics, languages, and importances", () => {
  const { root, logDir, indexPath } = makeTempPaths();
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "2026-06-01.jsonl");

  writeJsonl(logFile, [
    {
      timestamp: "2026-06-01T10:00:00.000Z",
      project: "iron-anchor",
      backend: "codex",
      mode: "normal",
      question: "How? #iron-anchor",
      answer: "```js\nlet a = 1;\n```\nWe decided to ship.",
    },
    {
      timestamp: "2026-06-01T10:10:00.000Z",
      project: "nq-trader",
      backend: "openai",
      mode: "normal",
      question: "Other?",
      answer: "Some plain text.",
    },
  ]);

  refreshIndex({ logDir, indexPath });

  const options = getFilterOptions({ indexPath });
  assert.deepEqual(options.topics.sort(), ["iron-anchor", "nq-trader"]);
  assert.deepEqual(options.languages, ["javascript"]);
  assert.deepEqual(options.importances.sort(), ["high", "low"]);

  fs.rmSync(root, { recursive: true, force: true });
});

test("openLogIndex migrates pre-existing databases without structured columns", () => {
  const { root, indexPath } = makeTempPaths();
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });

  const legacyDb = new DatabaseSync(indexPath);
  legacyDb.exec(`
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY,
      log_file TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      timestamp TEXT,
      project TEXT,
      backend TEXT,
      mode TEXT,
      model TEXT,
      question TEXT,
      answer TEXT,
      duration_ms INTEGER,
      usage_json TEXT,
      sources_json TEXT,
      raw_json TEXT,
      UNIQUE(log_file, line_number)
    );
  `);
  legacyDb.close();

  const db = openLogIndex(indexPath);
  const columns = db.prepare("PRAGMA table_info(entries)").all().map((row) => row.name);
  assert.ok(columns.includes("is_decision"));
  assert.ok(columns.includes("is_code_snippet"));
  assert.ok(columns.includes("topic"));
  assert.ok(columns.includes("language"));
  assert.ok(columns.includes("importance"));
  db.close();

  fs.rmSync(root, { recursive: true, force: true });
});
