export function parseJsonlLine(line, { logFile, lineNumber }) {
  const trimmed = line.trim();

  if (!trimmed) {
    return { entry: null, error: null };
  }

  try {
    const raw = JSON.parse(trimmed);
    return {
      entry: normalizeLogEntry(raw, { logFile, lineNumber }),
      error: null,
    };
  } catch (error) {
    return {
      entry: null,
      error: {
        logFile,
        lineNumber,
        message: error.message,
      },
    };
  }
}

export function normalizeLogEntry(raw, { logFile, lineNumber }) {
  const sources = extractSources(raw);

  return {
    logFile,
    lineNumber,
    timestamp: stringOrEmpty(raw.timestamp),
    project: stringOrEmpty(raw.project),
    backend: stringOrEmpty(raw.backend),
    mode: stringOrEmpty(raw.mode),
    model: stringOrEmpty(raw.model),
    question: stringOrEmpty(raw.question),
    answer: stringOrEmpty(raw.answer),
    durationMs: Number.isFinite(raw.durationMs) ? raw.durationMs : null,
    usageJson: raw.usage ? JSON.stringify(raw.usage) : null,
    sourcesJson: sources.length > 0 ? JSON.stringify(sources) : null,
    rawJson: JSON.stringify(raw),
    sources,
  };
}

export function extractSources(raw) {
  const sources = new Map();

  for (const source of extractSourcesFromRaw(raw.raw)) {
    sources.set(source.url, source);
  }

  for (const source of extractSourcesFromAnswer(raw.answer)) {
    sources.set(source.url, source);
  }

  return [...sources.values()];
}

function extractSourcesFromRaw(raw) {
  const sources = [];

  function visit(value) {
    if (!value || typeof value !== "object") {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    if (typeof value.url === "string" && /^https?:\/\//.test(value.url)) {
      sources.push({
        title: typeof value.title === "string" ? value.title : value.url,
        url: value.url,
      });
    }

    for (const child of Object.values(value)) {
      visit(child);
    }
  }

  visit(raw);
  return sources;
}

function extractSourcesFromAnswer(answer) {
  if (typeof answer !== "string") {
    return [];
  }

  const sources = [];
  const lines = answer.split(/\r?\n/);
  const sourceLine = /^\s*\d+\.\s*(.*?):\s*(https?:\/\/\S+)\s*$/;
  const markdownLink = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;

  for (const line of lines) {
    const numbered = line.match(sourceLine);
    if (numbered) {
      sources.push({
        title: numbered[1].trim() || numbered[2],
        url: stripTrailingPunctuation(numbered[2]),
      });
      continue;
    }

    for (const match of line.matchAll(markdownLink)) {
      sources.push({
        title: match[1].trim() || match[2],
        url: stripTrailingPunctuation(match[2]),
      });
    }
  }

  return sources;
}

function stripTrailingPunctuation(url) {
  return url.replace(/[)\]]+$/, "");
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value : "";
}
