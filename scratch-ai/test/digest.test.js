import test from "node:test";
import assert from "node:assert/strict";
import { renderDigestMarkdown } from "../src/digest.js";
import { formatEntriesMarkdown, formatEntriesText } from "../src/logExport.js";
import { parseInput } from "../src/modes.js";

const entries = [
  {
    ref: "2026-06-01.jsonl:1",
    timestamp: "2026-06-01T10:00:00.000Z",
    project: "demo",
    mode: "web",
    question: "Should we keep JSONL canonical?",
    answer: "Yes. Decision: keep JSONL canonical and rebuild SQLite.",
    favorite: true,
    tags: ["logs"],
    sources: [{ title: "SQLite", url: "https://sqlite.org/fts5.html" }],
  },
];

test("renderDigestMarkdown creates expected review sections", () => {
  const markdown = renderDigestMarkdown({ entries, date: "2026-06-01", project: "demo" });

  assert.match(markdown, /# Scratch AI Review - 2026-06-01/);
  assert.match(markdown, /## Useful Answers/);
  assert.match(markdown, /Should we keep JSONL canonical/);
  assert.match(markdown, /## Possible Decisions/);
  assert.match(markdown, /https:\/\/sqlite.org\/fts5.html/);
});

test("log export supports text and markdown formats", () => {
  assert.match(formatEntriesText(entries), /2026-06-01\.jsonl:1/);
  assert.match(formatEntriesMarkdown(entries), /\*\*Question\*\*/);
  assert.match(formatEntriesMarkdown(entries), /tags: logs/);
});

test("parseInput supports save and tag commands", () => {
  assert.deepEqual(parseInput("/save 3 laravel queue"), {
    type: "command",
    command: "save",
    index: 3,
    tags: ["laravel", "queue"],
  });
  assert.deepEqual(parseInput("/tag 2 ops"), {
    type: "command",
    command: "tag",
    index: 2,
    tags: ["ops"],
  });
});

test("parseInput supports context commands", () => {
  assert.deepEqual(parseInput("/context"), {
    type: "command",
    command: "context",
    action: "status",
  });
  assert.deepEqual(parseInput("/context off"), {
    type: "command",
    command: "context",
    action: "off",
  });
  assert.deepEqual(parseInput("/context on"), {
    type: "command",
    command: "context",
    action: "on",
  });
});
