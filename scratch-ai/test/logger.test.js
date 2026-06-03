import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLogFilePath, appendLog } from "../src/logger.js";
import { config } from "../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.join(__dirname, "..", ".test-temp-logs");

test("getLogFilePath returns path ending in today's date .jsonl", () => {
  const result = getLogFilePath();
  const datePart = new Date().toISOString().slice(0, 10);
  assert.equal(result.endsWith(`${datePart}.jsonl`), true);
});

test("getLogFilePath uses provided date", () => {
  const fixedDate = new Date("2024-01-15T12:00:00Z");
  const result = getLogFilePath(fixedDate);
  assert.equal(result.endsWith("2024-01-15.jsonl"), true);
});

test("appendLog creates file and returns logFile and lineNumber", () => {
  const testDir = path.join(tempDir, "append-log-test");
  fs.mkdirSync(testDir, { recursive: true });

  const originalLogDir = config.logDir;
  config.logDir = testDir;

  try {
    const result1 = appendLog({ question: "Test question?", answer: "Test answer." });
    assert.equal(typeof result1.logFile === "string", true);
    assert.equal(result1.lineNumber, 1);
    assert.equal(fs.existsSync(result1.logFile), true);

    const result2 = appendLog({ question: "Second?", answer: "Answer 2." });
    assert.equal(result2.lineNumber, 2);

    const lines = fs.readFileSync(result1.logFile, "utf8").split("\n").filter(Boolean);
    assert.equal(lines.length, 2);

    const entry = JSON.parse(lines[0]);
    assert.equal(entry.question, "Test question?");
    assert.equal(entry.answer, "Test answer.");
    assert.equal(typeof entry.timestamp === "string", true);
  } finally {
    config.logDir = originalLogDir;
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});