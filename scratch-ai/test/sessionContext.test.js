import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQuestionWithContext,
  formatSessionContext,
  selectSessionContext,
} from "../src/sessionContext.js";

const history = [
  { index: 1, mode: "normal", question: "What is Redis?", answer: "An in-memory data store." },
  { index: 2, mode: "think", question: "Compare JSONL and SQLite", answer: "JSONL is canonical; SQLite is an index." },
  { index: 3, mode: "normal", question: "What about backups?", answer: "Back up the JSONL files." },
];

test("selectSessionContext keeps recent exchanges in original order", () => {
  const selected = selectSessionContext(history, { maxExchanges: 2, maxChars: 1000 });

  assert.deepEqual(
    selected.map((entry) => entry.index),
    [2, 3]
  );
});

test("selectSessionContext respects maxChars limit before first entry", () => {
  const largeEntry = { index: 1, mode: "normal", question: "A".repeat(500), answer: "B".repeat(500) };
  const smallEntry = { index: 2, mode: "normal", question: "small", answer: "tiny" };
  const selected = selectSessionContext([largeEntry, smallEntry], { maxExchanges: 2, maxChars: 100 });

  assert.deepEqual(selected.map((e) => e.index), [2]);
});

test("selectSessionContext skips entries with missing question or answer", () => {
  const mixedHistory = [
    { index: 1, mode: "normal", question: "", answer: "Has answer" },
    { index: 2, mode: "normal", question: "Has question", answer: "" },
    { index: 3, mode: "normal", question: "Full", answer: "Entry" },
  ];
  const selected = selectSessionContext(mixedHistory, { maxExchanges: 5, maxChars: 10000 });
  assert.deepEqual(selected.map((e) => e.index), [3]);
});

test("selectSessionContext returns empty when all entries invalid", () => {
  const emptyHistory = [
    { index: 1, mode: "normal", question: "", answer: "" },
  ];
  const selected = selectSessionContext(emptyHistory, { maxExchanges: 5, maxChars: 10000 });
  assert.deepEqual(selected, []);
});

test("selectSessionContext handles empty history", () => {
  const selected = selectSessionContext([], { maxExchanges: 5, maxChars: 10000 });
  assert.deepEqual(selected, []);
});

test("formatSessionContext and buildQuestionWithContext include prior turns", () => {
  const selected = selectSessionContext(history, { maxExchanges: 1, maxChars: 1000 });
  const formatted = formatSessionContext(selected);
  const prompt = buildQuestionWithContext("Can you expand that?", selected);

  assert.match(formatted, /Turn 3/);
  assert.match(formatted, /Back up the JSONL files/);
  assert.match(prompt, /Recent session context/);
  assert.match(prompt, /Current question:\nCan you expand that\?/);
});
