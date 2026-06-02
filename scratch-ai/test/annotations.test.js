import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { annotationState, appendAnnotation, readAnnotations } from "../src/annotations.js";

test("appendAnnotation stores append-only favorite and tags", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scratch-ai-ann-"));
  const annotationDir = path.join(root, "annotations");
  const entryRef = { logFile: "2026-06-01.jsonl", lineNumber: 2 };

  appendAnnotation({
    annotationDir,
    entryRef,
    favorite: true,
    tags: ["Laravel", "queue", "queue"],
    note: "Worth keeping",
  });

  appendAnnotation({
    annotationDir,
    entryRef,
    tags: ["ops"],
  });

  const { annotations, malformedLines } = readAnnotations({ annotationDir });
  assert.equal(malformedLines, 0);
  assert.equal(annotations.length, 2);

  const state = annotationState({ annotationDir });
  const merged = state.byEntry.get("2026-06-01.jsonl:2");
  assert.equal(merged.favorite, true);
  assert.deepEqual(merged.tags.sort(), ["laravel", "ops", "queue"]);
  assert.deepEqual(merged.notes, ["Worth keeping"]);

  fs.rmSync(root, { recursive: true, force: true });
});

test("readAnnotations tolerates malformed annotation lines", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scratch-ai-ann-"));
  const annotationDir = path.join(root, "annotations");
  fs.mkdirSync(annotationDir, { recursive: true });
  fs.writeFileSync(path.join(annotationDir, "2026-06-01.jsonl"), "{bad json}\n", "utf8");

  const result = readAnnotations({ annotationDir });
  assert.equal(result.annotations.length, 0);
  assert.equal(result.malformedLines, 1);

  fs.rmSync(root, { recursive: true, force: true });
});
