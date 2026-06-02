import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

function dateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function getAnnotationFilePath(date = new Date(), annotationDir = config.annotationDir) {
  return path.join(annotationDir, `${dateStamp(date)}.jsonl`);
}

export function normalizeTags(tags = []) {
  return [...new Set(
    tags
      .map((tag) => String(tag).trim().toLowerCase())
      .filter(Boolean)
  )];
}

export function entryKey(ref) {
  if (!ref?.logFile || !Number.isFinite(ref.lineNumber)) {
    return null;
  }

  return `${ref.logFile}:${ref.lineNumber}`;
}

export function appendAnnotation({
  entryRef,
  favorite = false,
  tags = [],
  note = "",
  project = config.project,
  annotationDir = config.annotationDir,
}) {
  if (!entryKey(entryRef)) {
    throw new Error("Annotation requires entryRef.logFile and entryRef.lineNumber.");
  }

  ensureDir(annotationDir);
  const file = getAnnotationFilePath(new Date(), annotationDir);
  const annotation = {
    timestamp: new Date().toISOString(),
    project,
    entryRef,
    favorite: Boolean(favorite),
    tags: normalizeTags(tags),
    note: typeof note === "string" ? note : "",
  };

  fs.appendFileSync(file, `${JSON.stringify(annotation)}\n`, "utf8");
  return { ...annotation, annotationFile: file };
}

export function annotateEntry(entry, options = {}) {
  return appendAnnotation({
    ...options,
    entryRef: {
      logFile: entry.logFile,
      lineNumber: entry.lineNumber,
    },
    project: options.project || entry.project || config.project,
  });
}

export function readAnnotations({ annotationDir = config.annotationDir } = {}) {
  if (!fs.existsSync(annotationDir)) {
    return { annotations: [], malformedLines: 0 };
  }

  const annotations = [];
  let malformedLines = 0;
  const files = fs
    .readdirSync(annotationDir)
    .filter((file) => file.endsWith(".jsonl"))
    .sort()
    .map((file) => path.join(annotationDir, file));

  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!line.trim()) return;

      try {
        const raw = JSON.parse(line);
        const key = entryKey(raw.entryRef);
        if (!key) {
          malformedLines += 1;
          return;
        }

        annotations.push({
          annotationFile: file,
          lineNumber: index + 1,
          timestamp: typeof raw.timestamp === "string" ? raw.timestamp : "",
          project: typeof raw.project === "string" ? raw.project : "",
          entryRef: raw.entryRef,
          favorite: Boolean(raw.favorite),
          tags: normalizeTags(Array.isArray(raw.tags) ? raw.tags : []),
          note: typeof raw.note === "string" ? raw.note : "",
        });
      } catch {
        malformedLines += 1;
      }
    });
  }

  return { annotations, malformedLines };
}

export function annotationState(options = {}) {
  const { annotations, malformedLines } = readAnnotations(options);
  const byEntry = new Map();

  for (const annotation of annotations) {
    const key = entryKey(annotation.entryRef);
    const current = byEntry.get(key) || {
      favorite: false,
      tags: [],
      notes: [],
      annotations: [],
    };

    current.favorite = current.favorite || annotation.favorite;
    current.tags = normalizeTags([...current.tags, ...annotation.tags]);
    if (annotation.note) current.notes.push(annotation.note);
    current.annotations.push(annotation);
    byEntry.set(key, current);
  }

  return { byEntry, malformedLines };
}
