import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdownForTerminal } from "../src/terminalMarkdown.js";

test("renderMarkdownForTerminal styles common markdown structure for terminal output", () => {
  const output = renderMarkdownForTerminal(
    [
      "# Plan",
      "",
      "- **Build** the `renderer`",
      "1. Keep [docs](https://example.com/docs)",
      "> quoted note",
      "- [x] checked",
    ].join("\n")
  );

  assert.match(output, /Plan/);
  assert.match(output, /- Build the renderer/);
  assert.match(output, /1\. Keep docs \(https:\/\/example\.com\/docs\)/);
  assert.match(output, /\| quoted note/);
  assert.match(output, /\[x\] checked/);
  assert.doesNotMatch(output, /\*\*Build\*\*/);
  assert.doesNotMatch(output, /`renderer`/);
  assert.doesNotMatch(output, /\[docs\]\(/);
});

test("renderMarkdownForTerminal keeps fenced code content readable", () => {
  const output = renderMarkdownForTerminal(
    [
      "```js",
      "const value = `literal`;",
      "```",
    ].join("\n")
  );

  assert.match(output, /js/);
  assert.match(output, /const value = `literal`;/);
  assert.doesNotMatch(output, /\ncode$/);
});
