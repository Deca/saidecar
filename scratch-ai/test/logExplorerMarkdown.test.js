import test from "node:test";
import assert from "node:assert/strict";
import {
  markdownDetailLines,
  searchTerms,
  splitHighlightedText,
} from "../src/logExplorerApp.js";

test("markdownDetailLines renders common assistant markdown as display lines", () => {
  const lines = markdownDetailLines(
    [
      "# Plan",
      "",
      "- **Build** the `renderer`",
      "1. Keep [docs](https://example.com/docs)",
      "> quoted note",
      "- [x] checked",
      "```js",
      "const value = `literal`;",
      "```",
    ].join("\n")
  );

  const text = lines.map((line) => line.text).join("\n");
  assert.match(text, /Plan/);
  assert.match(text, /- Build the renderer/);
  assert.match(text, /1\. Keep docs \(https:\/\/example\.com\/docs\)/);
  assert.match(text, /\| quoted note/);
  assert.match(text, /\[x\] checked/);
  assert.match(text, /js/);
  assert.match(text, /const value = `literal`;/);
  assert.doesNotMatch(text, /\*\*Build\*\*/);
  assert.doesNotMatch(text, /`renderer`/);
});

test("searchTerms and splitHighlightedText identify query matches", () => {
  assert.deepEqual(searchTerms("sqlite SQLite fts"), ["sqlite", "fts"]);

  const segments = splitHighlightedText("Use SQLite FTS for sqlite logs.", ["sqlite"]);
  assert.deepEqual(segments, [
    { text: "Use ", highlight: false },
    { text: "SQLite", highlight: true },
    { text: " FTS for ", highlight: false },
    { text: "sqlite", highlight: true },
    { text: " logs.", highlight: false },
  ]);
});
