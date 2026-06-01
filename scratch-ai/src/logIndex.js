import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";
import { parseJsonlLine } from "./logParser.js";

export function openLogIndex(indexPath = config.indexPath) {
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  const db = new DatabaseSync(indexPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  ensureSchema(db);
  return db;
}

export function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY,
      log_file TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      timestamp TEXT,
      project TEXT,
      backend TEXT,
      mode TEXT,
      model TEXT,
      question TEXT,
      answer TEXT,
      duration_ms INTEGER,
      usage_json TEXT,
      sources_json TEXT,
      raw_json TEXT,
      UNIQUE(log_file, line_number)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts
    USING fts5(entry_id UNINDEXED, question, answer, sources);

    CREATE TABLE IF NOT EXISTS index_state (
      log_file TEXT PRIMARY KEY,
      size INTEGER NOT NULL,
      mtime_ms REAL NOT NULL,
      line_count INTEGER NOT NULL,
      indexed_at TEXT NOT NULL
    );
  `);
}

export function refreshIndex({
  logDir = config.logDir,
  indexPath = config.indexPath,
} = {}) {
  const db = openLogIndex(indexPath);
  const stats = {
    indexedFiles: 0,
    skippedFiles: 0,
    indexedEntries: 0,
    malformedLines: 0,
    warnings: [],
  };

  try {
    if (!fs.existsSync(logDir)) {
      return stats;
    }

    const files = fs
      .readdirSync(logDir)
      .filter((file) => file.endsWith(".jsonl"))
      .sort()
      .map((file) => path.join(logDir, file));

    db.exec("BEGIN");
    try {
      for (const file of files) {
        indexFileIfChanged(db, file, stats);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return stats;
  } finally {
    db.close();
  }
}

function indexFileIfChanged(db, file, stats) {
  const fileStats = fs.statSync(file);
  const state = db
    .prepare("SELECT size, mtime_ms FROM index_state WHERE log_file = ?")
    .get(file);

  if (
    state &&
    state.size === fileStats.size &&
    Math.trunc(state.mtime_ms) === Math.trunc(fileStats.mtimeMs)
  ) {
    stats.skippedFiles += 1;
    return;
  }

  const existingIds = db
    .prepare("SELECT id FROM entries WHERE log_file = ?")
    .all(file)
    .map((row) => row.id);

  const deleteFts = db.prepare("DELETE FROM entries_fts WHERE entry_id = ?");
  for (const id of existingIds) {
    deleteFts.run(id);
  }
  db.prepare("DELETE FROM entries WHERE log_file = ?").run(file);

  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);
  const insertEntry = db.prepare(`
    INSERT INTO entries (
      log_file, line_number, timestamp, project, backend, mode, model,
      question, answer, duration_ms, usage_json, sources_json, raw_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFts = db.prepare(`
    INSERT INTO entries_fts (entry_id, question, answer, sources)
    VALUES (?, ?, ?, ?)
  `);

  let lineCount = 0;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const { entry, error } = parseJsonlLine(line, { logFile: file, lineNumber });

    if (error) {
      stats.malformedLines += 1;
      stats.warnings.push(error);
      return;
    }

    if (!entry) {
      return;
    }

    lineCount += 1;
    const result = insertEntry.run(
      entry.logFile,
      entry.lineNumber,
      entry.timestamp,
      entry.project,
      entry.backend,
      entry.mode,
      entry.model,
      entry.question,
      entry.answer,
      entry.durationMs,
      entry.usageJson,
      entry.sourcesJson,
      entry.rawJson
    );
    insertFts.run(
      result.lastInsertRowid,
      entry.question,
      entry.answer,
      entry.sources.map((source) => `${source.title} ${source.url}`).join("\n")
    );
    stats.indexedEntries += 1;
  });

  db.prepare(`
    INSERT INTO index_state (log_file, size, mtime_ms, line_count, indexed_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(log_file) DO UPDATE SET
      size = excluded.size,
      mtime_ms = excluded.mtime_ms,
      line_count = excluded.line_count,
      indexed_at = excluded.indexed_at
  `).run(file, fileStats.size, fileStats.mtimeMs, lineCount, new Date().toISOString());

  stats.indexedFiles += 1;
}

export function searchEntries({
  query = "",
  mode = "all",
  backend = "all",
  project = "all",
  date = "all",
  limit = 100,
  indexPath = config.indexPath,
} = {}) {
  const db = openLogIndex(indexPath);

  try {
    const where = [];
    const params = {};
    let join = "";

    if (query.trim()) {
      join = "JOIN entries_fts fts ON fts.entry_id = entries.id";
      where.push("entries_fts MATCH $query");
      params.$query = buildFtsQuery(query);
    }

    if (mode !== "all") {
      where.push("mode = $mode");
      params.$mode = mode;
    }

    if (backend !== "all") {
      where.push("backend = $backend");
      params.$backend = backend;
    }

    if (project !== "all") {
      where.push("project = $project");
      params.$project = project;
    }

    const dateCutoff = dateToCutoff(date);
    if (dateCutoff) {
      where.push("timestamp >= $dateCutoff");
      params.$dateCutoff = dateCutoff;
    }

    params.$limit = limit;
    const sql = `
      SELECT entries.*
      FROM entries
      ${join}
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY timestamp DESC, id DESC
      LIMIT $limit
    `;

    return db.prepare(sql).all(params).map(rowToEntry);
  } finally {
    db.close();
  }
}

export function getFilterOptions({ indexPath = config.indexPath } = {}) {
  const db = openLogIndex(indexPath);

  try {
    return {
      modes: distinctValues(db, "mode"),
      backends: distinctValues(db, "backend"),
      projects: distinctValues(db, "project"),
    };
  } finally {
    db.close();
  }
}

function distinctValues(db, column) {
  return db
    .prepare(`SELECT DISTINCT ${column} AS value FROM entries WHERE ${column} != '' ORDER BY ${column}`)
    .all()
    .map((row) => row.value);
}

function rowToEntry(row) {
  return {
    id: row.id,
    logFile: row.log_file,
    lineNumber: row.line_number,
    timestamp: row.timestamp,
    project: row.project,
    backend: row.backend,
    mode: row.mode,
    model: row.model,
    question: row.question,
    answer: row.answer,
    durationMs: row.duration_ms,
    usage: parseJson(row.usage_json),
    sources: parseJson(row.sources_json) || [],
    raw: parseJson(row.raw_json),
  };
}

function parseJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildFtsQuery(query) {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(" AND ");
}

function dateToCutoff(date) {
  const now = new Date();

  if (date === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }

  if (date === "7d") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  if (date === "30d") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  return null;
}
