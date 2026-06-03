import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractStructuredFields,
  extractCodeBlocks,
  extractLanguage,
  detectCodeSnippet,
  detectDecision,
  extractTopic,
  scoreImportance,
  IMPORTANCE_HIGH,
  IMPORTANCE_MEDIUM,
  IMPORTANCE_LOW,
  isImportanceValue,
} from "../src/structuredExtract.js";

describe("extractCodeBlocks", () => {
  it("returns empty array for non-string input", () => {
    assert.deepEqual(extractCodeBlocks(null), []);
    assert.deepEqual(extractCodeBlocks(undefined), []);
    assert.deepEqual(extractCodeBlocks(""), []);
  });

  it("parses a fenced python block with language", () => {
    const blocks = extractCodeBlocks("Here:\n```python\nprint('hi')\n```\nDone.");
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].language, "python");
    assert.equal(blocks[0].content, "print('hi')");
  });

  it("parses tilde fences with no language", () => {
    const blocks = extractCodeBlocks("~~~ \nraw text\n~~~");
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].language, null);
    assert.equal(blocks[0].content, "raw text");
  });

  it("returns multiple blocks in order", () => {
    const blocks = extractCodeBlocks("```js\nconst a = 1;\n```\ntext\n```sql\nSELECT 1;\n```");
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].language, "javascript");
    assert.equal(blocks[1].language, "sql");
  });
});

describe("extractLanguage", () => {
  it("returns null when no fenced block", () => {
    assert.equal(extractLanguage("Just plain text."), null);
  });

  it("returns first language found", () => {
    assert.equal(extractLanguage("```typescript\nlet x = 1;\n```"), "typescript");
  });

  it("normalizes language aliases", () => {
    assert.equal(extractLanguage("```py\nprint(1)\n```"), "python");
    assert.equal(extractLanguage("```ts\nlet x;\n```"), "typescript");
    assert.equal(extractLanguage("```yml\nkey: val\n```"), "yaml");
  });
});

describe("detectCodeSnippet", () => {
  it("returns false for empty or non-string", () => {
    assert.equal(detectCodeSnippet(""), false);
    assert.equal(detectCodeSnippet(null), false);
  });

  it("returns true for fenced code blocks", () => {
    assert.equal(detectCodeSnippet("```\nplain\n```"), true);
  });

  it("returns true for many inline code spans", () => {
    assert.equal(detectCodeSnippet("Use `a` and `b` and `c` here."), true);
  });

  it("returns true for code-like lines (assignment with braces)", () => {
    const text = "function add(a, b) {\n  return a + b;\n}";
    assert.equal(detectCodeSnippet(text), true);
  });

  it("returns false for plain prose", () => {
    assert.equal(detectCodeSnippet("This is just a regular sentence with no code."), false);
  });
});

describe("detectDecision", () => {
  it("matches explicit decision keywords", () => {
    assert.equal(detectDecision("Should we move to Postgres?", "Yes."), true);
    assert.equal(detectDecision("", "We decided to use SQLite."), true);
  });

  it("matches 'we will go with' style", () => {
    assert.equal(detectDecision("", "Going forward we'll go with the FTS5 approach."), true);
  });

  it("returns false for non-decision text", () => {
    assert.equal(detectDecision("What is FTS5?", "Full text search."), false);
  });

  it("handles empty inputs", () => {
    assert.equal(detectDecision("", ""), false);
  });
});

describe("extractTopic", () => {
  it("uses explicit topic: prefix", () => {
    assert.equal(extractTopic({ question: "Topic: database-migration — how do I..." }), "database-migration");
  });

  it("uses first hashtag in question", () => {
    assert.equal(extractTopic({ question: "How do I scale #trading-execution?" }), "trading-execution");
  });

  it("normalizes hashtags to slug form", () => {
    assert.equal(extractTopic({ question: "Need help with #Trading-Execution today!" }), "trading-execution");
  });

  it("falls back to project when no hashtag or prefix", () => {
    assert.equal(extractTopic({ question: "How?", project: "iron-anchor" }), "iron-anchor");
  });

  it("returns null when no source", () => {
    assert.equal(extractTopic({ question: "" }), null);
  });
});

describe("scoreImportance", () => {
  it("returns low for empty signals", () => {
    assert.equal(scoreImportance({}), IMPORTANCE_LOW);
  });

  it("returns high when decision + code + sources", () => {
    assert.equal(
      scoreImportance({ isDecision: true, isCodeSnippet: true, sourceCount: 2 }),
      IMPORTANCE_HIGH
    );
  });

  it("returns medium for code + long answer", () => {
    const longAnswer = "x".repeat(1500);
    assert.equal(
      scoreImportance({ isCodeSnippet: true, answerLength: longAnswer.length }),
      IMPORTANCE_HIGH
    );
  });

  it("clamps source contribution", () => {
    assert.equal(scoreImportance({ sourceCount: 10 }), IMPORTANCE_MEDIUM);
  });
});

describe("isImportanceValue", () => {
  it("accepts known values", () => {
    assert.equal(isImportanceValue("high"), true);
    assert.equal(isImportanceValue("medium"), true);
    assert.equal(isImportanceValue("low"), true);
  });

  it("rejects unknown values", () => {
    assert.equal(isImportanceValue(""), false);
    assert.equal(isImportanceValue("critical"), false);
    assert.equal(isImportanceValue(null), false);
  });
});

describe("extractStructuredFields", () => {
  it("extracts a complete profile from a code+decision entry", () => {
    const entry = {
      question: "How do I migrate the Iron Anchor schema? #iron-anchor",
      answer: "Use this:\n```sql\nALTER TABLE x ADD COLUMN y TEXT;\n```\nWe decided to run it in production.",
      project: "iron-anchor",
      sources: [{ title: "SQLite", url: "https://sqlite.org/alter.html" }],
    };
    const fields = extractStructuredFields(entry);
    assert.equal(fields.isCodeSnippet, true);
    assert.equal(fields.isDecision, true);
    assert.equal(fields.language, "sql");
    assert.equal(fields.topic, "iron-anchor");
    assert.equal(fields.importance, IMPORTANCE_HIGH);
  });

  it("returns nulls for empty entry", () => {
    const fields = extractStructuredFields({});
    assert.equal(fields.isCodeSnippet, false);
    assert.equal(fields.isDecision, false);
    assert.equal(fields.language, null);
    assert.equal(fields.topic, null);
    assert.equal(fields.importance, IMPORTANCE_LOW);
  });

  it("tolerates missing sources array", () => {
    const fields = extractStructuredFields({ question: "hi", answer: "hello" });
    assert.equal(fields.importance, IMPORTANCE_LOW);
  });

  it("falls back to project for topic when no hashtag", () => {
    const fields = extractStructuredFields({
      question: "What about NQ today?",
      answer: "Trading paused.",
      project: "nq-trader",
    });
    assert.equal(fields.topic, "nq-trader");
  });
});
