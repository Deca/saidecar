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

test("formatSessionContext and buildQuestionWithContext include prior turns", () => {
  const selected = selectSessionContext(history, { maxExchanges: 1, maxChars: 1000 });
  const formatted = formatSessionContext(selected);
  const prompt = buildQuestionWithContext("Can you expand that?", selected);

  assert.match(formatted, /Turn 3/);
  assert.match(formatted, /Back up the JSONL files/);
  assert.match(prompt, /Recent session context/);
  assert.match(prompt, /Current question:\nCan you expand that\?/);
});
