import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { getDateStamp } from "./dateUtils.js";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

let sessionLineCount = null;
let sessionLineCountFile = null;

function nextLineNumber(filePath) {
  if (sessionLineCount !== null && sessionLineCountFile === filePath) {
    return sessionLineCount + 1;
  }

  if (!fs.existsSync(filePath)) {
    sessionLineCount = 0;
    sessionLineCountFile = filePath;
    return 1;
  }

  const content = fs.readFileSync(filePath, "utf8");
  sessionLineCount = content ? content.split(/\r?\n/).filter((line) => line.length > 0).length : 0;
  sessionLineCountFile = filePath;
  return sessionLineCount + 1;
}

export function getLogFilePath(date = new Date()) {
  return path.join(config.logDir, `${getDateStamp(date)}.jsonl`);
}

const writeQueue = [];
let queueDraining = false;

function drainQueue() {
  if (queueDraining || writeQueue.length === 0) {
    return;
  }

  queueDraining = true;
  const entry = writeQueue.shift();

  fs.promises.appendFile(entry.file, `${entry.line}\n`, "utf8")
    .then(() => {
      if (entry.resolve) entry.resolve();
    })
    .catch((error) => {
      if (entry.reject) entry.reject(error);
    })
    .finally(() => {
      queueDraining = false;
      if (writeQueue.length > 0) {
        setImmediate(drainQueue);
      }
    });
}

export function appendLog(entry, options = {}) {
  ensureDir(config.logDir);
  const logFile = getLogFilePath();
  const lineNumber = nextLineNumber(logFile);
  sessionLineCount = lineNumber;
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    timezone: config.timezone,
    project: config.project,
    ...entry,
  });

  try {
    fs.appendFileSync(logFile, `${line}\n`, "utf8");
  } catch (error) {
    throw new Error(`Failed to append log: ${error.message}`);
  }

  if (!options.skipAutoFilter) {
    triggerAutoFilter(entry);
  }

  return { logFile, lineNumber };
}

let autoFilterRunning = false;
let autoFilterQueue = [];

async function processAutoFilterQueue() {
  if (autoFilterRunning || autoFilterQueue.length === 0) {
    return;
  }

  autoFilterRunning = true;

  while (autoFilterQueue.length > 0) {
    const entry = autoFilterQueue.shift();
    try {
      const { scoreEntry, formatAutoFilterMetadata } = await import("./autoFilter.js");
      const result = await scoreEntry({
        question: entry.question,
        answer: entry.answer,
        mode: entry.mode,
        model: entry.model,
      });

      if (result) {
        formatAutoFilterMetadata(result);
      }
    } catch (error) {
      // Silently fail - auto-filter is best-effort
    }
  }

  autoFilterRunning = false;
}

function triggerAutoFilter(entry) {
  if (!config.autoFilterEnabled) {
    return null;
  }

  if (!entry.question || !entry.answer) {
    return null;
  }

  autoFilterQueue.push(entry);
  setImmediate(processAutoFilterQueue);
  return null;
}

export async function triggerAutoFilterAndWait(entry) {
  if (!config.autoFilterEnabled) {
    return null;
  }

  if (!entry.question || !entry.answer) {
    return null;
  }

  try {
    const { scoreEntry } = await import("./autoFilter.js");
    const result = await scoreEntry({
      question: entry.question,
      answer: entry.answer,
      mode: entry.mode,
      model: entry.model,
    });
    return result?.decision || null;
  } catch {
    return null;
  }
}

export async function appendLogAsync(entry) {
  ensureDir(config.logDir);
  const logFile = getLogFilePath();
  const lineNumber = nextLineNumber(logFile);
  sessionLineCount = lineNumber;
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    timezone: config.timezone,
    project: config.project,
    ...entry,
  });

  return new Promise((resolve, reject) => {
    writeQueue.push({ file: logFile, line, resolve, reject });
    setImmediate(drainQueue);
  }).then(() => ({ logFile, lineNumber }));
}
