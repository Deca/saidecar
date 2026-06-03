import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  renderDigestMarkdown,
  isoWeekRange,
  renderWeeklyDigestMarkdown,
  weeklyFileName,
  weekStartFromIso,
  findLatestWeekly,
  isStaleWeekly,
  describeWeeklyStatus,
} from "../src/digest.js";
import { refreshIndex, searchEntries } from "../src/logIndex.js";
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

  assert.match(markdown, /# sAIdecar Review - 2026-06-01/);
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

test("isoWeekRange aligns to Monday and rolls back N weeks", () => {
  const wed = new Date("2026-06-03T12:00:00.000Z");
  const current = isoWeekRange({ referenceDate: wed });
  assert.equal(current.weekStartStamp, "2026-06-01");
  assert.equal(current.weekEndStamp, "2026-06-07");
  assert.equal(current.isoYear, 2026);
  assert.equal(current.isoWeek, 23);

  const last = isoWeekRange({ referenceDate: wed, weeksAgo: 1 });
  assert.equal(last.weekStartStamp, "2026-05-25");
  assert.equal(last.weekEndStamp, "2026-05-31");
  assert.equal(last.isoWeek, 22);
});

test("isoWeekRange starts week on Sunday input as the same week", () => {
  const sun = new Date("2026-06-07T23:00:00.000Z");
  const range = isoWeekRange({ referenceDate: sun });
  assert.equal(range.weekStartStamp, "2026-06-01");
  assert.equal(range.weekEndStamp, "2026-06-07");
});

test("renderWeeklyDigestMarkdown renders all sections and topic counts", () => {
  const entries = [
    {
      ref: "2026-06-01.jsonl:1",
      timestamp: "2026-06-01T10:00:00.000Z",
      project: "iron-anchor",
      mode: "think",
      question: "Should we add retry logic to the order executor?",
      answer: "We decided to add an exponential backoff.",
      isDecision: true,
      isCodeSnippet: false,
      topic: "iron-anchor",
      language: null,
      importance: "high",
      favorite: true,
      tags: ["execution"],
      sources: [],
    },
    {
      ref: "2026-06-02.jsonl:4",
      timestamp: "2026-06-02T11:00:00.000Z",
      project: "iron-anchor",
      mode: "normal",
      question: "Python async example for queue worker?",
      answer: "```python\nasync def worker(): pass\n```",
      isDecision: false,
      isCodeSnippet: true,
      topic: "iron-anchor",
      language: "python",
      importance: "high",
      favorite: false,
      tags: [],
      sources: [],
    },
    {
      ref: "2026-06-03.jsonl:2",
      timestamp: "2026-06-03T09:00:00.000Z",
      project: "nq-trader",
      mode: "web",
      question: "Latest NQ market session summary?",
      answer: "Range-bound, low volume.",
      isDecision: false,
      isCodeSnippet: false,
      topic: "nq-trader",
      language: null,
      importance: "low",
      favorite: false,
      tags: [],
      sources: [{ title: "CME", url: "https://www.cmegroup.com/" }],
    },
  ];

  const range = isoWeekRange({ referenceDate: "2026-06-03" });
  const markdown = renderWeeklyDigestMarkdown({
    entries,
    weekStart: range.weekStart,
    weekEnd: range.weekEnd,
    weekStartStamp: range.weekStartStamp,
    weekEndStamp: range.weekEndStamp,
    isoYear: range.isoYear,
    isoWeek: range.isoWeek,
    project: "all",
  });

  assert.match(markdown, /# Weekly Digest - 2026-06-01 to 2026-06-07 \(ISO 2026-W23\)/);
  assert.match(markdown, /## Activity Stats/);
  assert.match(markdown, /## Topics/);
  assert.match(markdown, /iron-anchor: 2/);
  assert.match(markdown, /## Key Decisions/);
  assert.match(markdown, /## Code Snippets/);
  assert.match(markdown, /## High-Importance Entries/);
  assert.match(markdown, /## Saved Entries/);
  assert.match(markdown, /By day:/);
  assert.match(markdown, /iron-anchor: 2/);
  assert.match(markdown, /nq-trader: 1/);
});

test("renderWeeklyDigestMarkdown includes llmSummary section when provided", () => {
  const range = isoWeekRange({ referenceDate: "2026-06-03" });
  const markdown = renderWeeklyDigestMarkdown({
    entries: [],
    weekStart: range.weekStart,
    weekEnd: range.weekEnd,
    weekStartStamp: range.weekStartStamp,
    weekEndStamp: range.weekEndStamp,
    isoYear: range.isoYear,
    isoWeek: range.isoWeek,
    llmSummary: "- Mostly quiet week.\n- One project in focus.",
  });
  assert.match(markdown, /## Summary/);
  assert.match(markdown, /Mostly quiet week\./);
});

test("weeklyFileName pads ISO week number", () => {
  assert.equal(weeklyFileName({ isoYear: 2026, isoWeek: 3 }), "weekly-2026-W03.md");
  assert.equal(weeklyFileName({ isoYear: 2026, isoWeek: 23 }), "weekly-2026-W23.md");
});

test("searchEntries honors since/until range across the weekly window", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "saidecar-weekly-"));
  const logDir = path.join(root, "inbox");
  const indexPath = path.join(root, "scratch-ai.sqlite");
  fs.mkdirSync(logDir, { recursive: true });

  const jsonl = [
    {
      timestamp: "2026-05-25T08:00:00.000Z",
      project: "demo",
      backend: "codex",
      mode: "normal",
      question: "Entry from prior week",
      answer: "Should not appear.",
    },
    {
      timestamp: "2026-06-02T08:00:00.000Z",
      project: "demo",
      backend: "codex",
      mode: "normal",
      question: "Entry inside the week",
      answer: "Should appear.",
    },
    {
      timestamp: "2026-06-08T08:00:00.000Z",
      project: "demo",
      backend: "codex",
      mode: "normal",
      question: "Entry after the week",
      answer: "Should not appear.",
    },
  ]
    .map((entry) => JSON.stringify(entry))
    .join("\n");

  fs.writeFileSync(path.join(logDir, "mix.jsonl"), jsonl + "\n");
  refreshIndex({ logDir, indexPath });

  const range = isoWeekRange({ referenceDate: "2026-06-03" });
  const since = new Date(range.weekStart);
  since.setUTCHours(0, 0, 0, 0);
  const until = new Date(range.weekEnd);
  until.setUTCHours(23, 59, 59, 999);

  const inside = searchEntries({
    indexPath,
    since: since.toISOString(),
    until: until.toISOString(),
    limit: 10,
  });
  assert.equal(inside.length, 1);
  assert.equal(inside[0].question, "Entry inside the week");

  fs.rmSync(root, { recursive: true, force: true });
});

test("weekStartFromIso maps ISO year/week back to the Monday", () => {
  const w1 = weekStartFromIso(2026, 1);
  assert.equal(w1.toISOString().slice(0, 10), "2025-12-29");

  const w23 = weekStartFromIso(2026, 23);
  assert.equal(w23.toISOString().slice(0, 10), "2026-06-01");

  const w52 = weekStartFromIso(2025, 1);
  assert.equal(w52.toISOString().slice(0, 10), "2024-12-30");

  assert.throws(() => weekStartFromIso(2026, 0), /Invalid ISO week/);
  assert.throws(() => weekStartFromIso(2026, 54), /Invalid ISO week/);
});

test("findLatestWeekly returns the most recent weekly file and ignores unrelated files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scratch-ai-weekly-latest-"));
  fs.writeFileSync(path.join(dir, "weekly-2026-W22.md"), "old");
  fs.writeFileSync(path.join(dir, "weekly-2026-W23.md"), "current");
  fs.writeFileSync(path.join(dir, "2026-06-01.md"), "daily");
  fs.writeFileSync(path.join(dir, "weekly-2026-W99.md"), "ignored");

  const latest = findLatestWeekly({ sessionDir: dir });
  assert.ok(latest);
  assert.equal(latest.isoYear, 2026);
  assert.equal(latest.isoWeek, 23);
  assert.equal(latest.file, "weekly-2026-W23.md");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("findLatestWeekly returns null when no weekly files exist", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scratch-ai-weekly-empty-"));
  fs.writeFileSync(path.join(dir, "2026-06-01.md"), "daily only");
  assert.equal(findLatestWeekly({ sessionDir: dir }), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("isStaleWeekly flags missing, stale, and fresh states", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scratch-ai-weekly-stale-"));

  const currentRange = isoWeekRange({ referenceDate: "2026-06-03" });

  const missing = isStaleWeekly({ sessionDir: dir, currentRange });
  assert.equal(missing.stale, true);
  assert.equal(missing.reason, "no-prior-weekly");
  assert.equal(missing.last, null);

  fs.writeFileSync(path.join(dir, "weekly-2026-W22.md"), "last week");
  const stale = isStaleWeekly({ sessionDir: dir, currentRange });
  assert.equal(stale.stale, true);
  assert.equal(stale.reason, "stale");
  assert.equal(stale.last.isoWeek, 22);

  fs.writeFileSync(path.join(dir, "weekly-2026-W23.md"), "this week");
  const fresh = isStaleWeekly({ sessionDir: dir, currentRange });
  assert.equal(fresh.stale, false);
  assert.equal(fresh.reason, "fresh");
  assert.equal(fresh.last.isoWeek, 23);
  assert.equal(fresh.ageDays, 0);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("describeWeeklyStatus produces human-friendly lines for each state", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scratch-ai-weekly-msg-"));
  const currentRange = isoWeekRange({ referenceDate: "2026-06-03" });

  const empty = describeWeeklyStatus({ sessionDir: dir, currentRange });
  assert.match(empty.line, /No weekly digest found yet/);
  assert.match(empty.line, /Current week: 2026-W23/);

  fs.writeFileSync(path.join(dir, "weekly-2026-W23.md"), "this week");
  const fresh = describeWeeklyStatus({ sessionDir: dir, currentRange });
  assert.match(fresh.line, /up to date/);
  assert.match(fresh.line, /2026-W23/);

  fs.rmSync(dir, { recursive: true, force: true });
});
