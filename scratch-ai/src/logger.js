import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

function getDateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function nextLineNumber(filePath) {
  if (!fs.existsSync(filePath)) {
    return 1;
  }

  const content = fs.readFileSync(filePath, "utf8");
  if (!content) {
    return 1;
  }

  return content.split(/\r?\n/).filter((line) => line.length > 0).length + 1;
}

export function getLogFilePath(date = new Date()) {
  return path.join(config.logDir, `${getDateStamp(date)}.jsonl`);
}

export function appendLog(entry) {
  ensureDir(config.logDir);
  const logFile = getLogFilePath();
  const lineNumber = nextLineNumber(logFile);
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    timezone: config.timezone,
    project: config.project,
    ...entry,
  });

  fs.appendFileSync(logFile, `${line}\n`, "utf8");
  return { logFile, lineNumber };
}
