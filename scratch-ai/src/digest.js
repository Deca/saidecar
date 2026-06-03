import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { searchEntries } from "./logIndex.js";

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function entryScore(entry) {
  let score = 0;
  if (entry.favorite) score += 6;
  if (entry.tags?.length) score += 3;
  if (entry.sources?.length) score += 2;
  if (entry.mode === "think" || entry.mode === "deepweb") score += 1;
  if (entry.isDecision) score += 2;
  if (entry.isCodeSnippet) score += 1;
  if (entry.importance === "high") score += 3;
  else if (entry.importance === "medium") score += 1;
  return score;
}

function short(text, maxLength = 220) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

export function selectDigestEntries({
  date = todayStamp(),
  project = "all",
  savedOnly = false,
  limit = 20,
  indexPath = config.indexPath,
} = {}) {
  const entries = searchEntries({
    date,
    project,
    saved: savedOnly,
    limit: 500,
    indexPath,
  });

  const preferred = entries
    .filter((entry) => savedOnly || entry.favorite || entry.tags?.length)
    .sort((a, b) => entryScore(b) - entryScore(a));

  return (preferred.length ? preferred : entries).slice(0, limit);
}

export function renderDigestMarkdown({ entries, date = todayStamp(), project = config.project }) {
  const lines = [
    `# Scratch AI Review - ${date}`,
    "",
    `Project: ${project}`,
    `Entries reviewed: ${entries.length}`,
    "",
    "## Useful Answers",
    "",
  ];

  if (!entries.length) {
    lines.push("- No matching Scratch AI entries found.");
  } else {
    for (const entry of entries) {
      const tags = entry.tags?.length ? ` (${entry.tags.join(", ")})` : "";
      lines.push(`- ${entry.question || "(no question)"}${tags}`);
      lines.push(`  ${short(entry.answer)}`);
    }
  }

  lines.push("", "## Possible Decisions", "");
  const decisionEntries = entries.filter((entry) => entry.isDecision || /decid|decision|choose|plan|should/i.test(`${entry.question}\n${entry.answer}`));
  if (decisionEntries.length) {
    for (const entry of decisionEntries.slice(0, 8)) {
      lines.push(`- ${short(entry.question, 180)}`);
    }
  } else {
    lines.push("- No obvious decisions found.");
  }

  lines.push("", "## Links And Sources", "");
  const sources = new Map();
  for (const entry of entries) {
    for (const source of entry.sources || []) {
      sources.set(source.url, source);
    }
  }
  if (sources.size) {
    for (const source of sources.values()) {
      lines.push(`- [${source.title || source.url}](${source.url})`);
    }
  } else {
    lines.push("- No sources found.");
  }

  lines.push("", "## Follow-Ups", "");
  const followUps = entries.filter((entry) => /follow.?up|todo|next|later|open question/i.test(`${entry.question}\n${entry.answer}`));
  if (followUps.length) {
    for (const entry of followUps.slice(0, 8)) {
      lines.push(`- ${short(entry.question, 180)}`);
    }
  } else {
    lines.push("- No obvious follow-ups found.");
  }

  lines.push("", "## Topics", "");
  const topicCounts = countBy(entries.filter((entry) => entry.topic), (entry) => entry.topic);
  if (topicCounts.length) {
    for (const [topic, count] of topicCounts.slice(0, 8)) {
      lines.push(`- ${topic}: ${count}`);
    }
  } else {
    lines.push("- No topic information extracted.");
  }

  lines.push("", "## High-Importance Entries", "");
  const highImportance = entries.filter((entry) => entry.importance === "high");
  if (highImportance.length) {
    for (const entry of highImportance.slice(0, 8)) {
      lines.push(`- ${short(entry.question, 180)}`);
    }
  } else {
    lines.push("- No high-importance entries.");
  }

  return `${lines.join("\n")}\n`;
}

function countBy(items, getKey) {
  const counts = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function writeDigest(markdown, date = todayStamp(), sessionDir = config.sessionDir) {
  fs.mkdirSync(sessionDir, { recursive: true });
  const file = path.join(sessionDir, `${date}.md`);
  fs.writeFileSync(file, markdown, "utf8");
  return file;
}
