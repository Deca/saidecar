import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { searchEntries } from "./logIndex.js";
import { askModel } from "./modelClient.js";

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

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoDateStamp(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function isoWeekNumber(date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  return { isoYear: target.getUTCFullYear(), isoWeek: weekNum };
}

export function isoWeekRange({ referenceDate = new Date(), weeksAgo = 0 } = {}) {
  const ref = new Date(referenceDate);
  const refUtc = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const dayNum = refUtc.getUTCDay() || 7;
  const monday = new Date(refUtc);
  monday.setUTCDate(refUtc.getUTCDate() - (dayNum - 1));
  monday.setUTCDate(monday.getUTCDate() - 7 * weeksAgo);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const { isoYear, isoWeek } = isoWeekNumber(monday);
  return {
    weekStart: monday,
    weekEnd: sunday,
    weekStartStamp: isoDateStamp(monday),
    weekEndStamp: isoDateStamp(sunday),
    isoYear,
    isoWeek,
  };
}

export function selectWeeklyEntries({
  weekStart,
  weekEnd,
  project = "all",
  savedOnly = false,
  limit = 1000,
  indexPath = config.indexPath,
} = {}) {
  if (!(weekStart instanceof Date) || !(weekEnd instanceof Date)) {
    throw new Error("selectWeeklyEntries requires weekStart and weekEnd Date instances.");
  }

  const since = new Date(weekStart);
  since.setUTCHours(0, 0, 0, 0);
  const until = new Date(weekEnd);
  until.setUTCHours(23, 59, 59, 999);

  return searchEntries({
    project,
    saved: savedOnly,
    since: since.toISOString(),
    until: until.toISOString(),
    limit,
    indexPath,
  });
}

function countByDay(entries) {
  const counts = new Map();
  for (const entry of entries) {
    if (!entry.timestamp) continue;
    const day = entry.timestamp.slice(0, 10);
    counts.set(day, (counts.get(day) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function uniqueProjects(entries) {
  const set = new Set();
  for (const entry of entries) {
    if (entry.project) set.add(entry.project);
  }
  return [...set].sort();
}

function dayLabel(stamp) {
  const date = new Date(`${stamp}T00:00:00.000Z`);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return `${stamp} ${days[(date.getUTCDay() + 6) % 7]}`;
}

function buildWeeklySections(entries) {
  const byProject = countBy(entries.filter((entry) => entry.project), (entry) => entry.project);
  const byMode = countBy(entries.filter((entry) => entry.mode), (entry) => entry.mode);
  const byTopic = countBy(entries.filter((entry) => entry.topic), (entry) => entry.topic);
  const byLanguage = countBy(
    entries.filter((entry) => entry.language),
    (entry) => entry.language
  );
  const byDay = countByDay(entries);
  const decisions = entries.filter((entry) => entry.isDecision);
  const codeSnippets = entries.filter((entry) => entry.isCodeSnippet);
  const highImportance = entries.filter((entry) => entry.importance === "high");
  const saved = entries.filter((entry) => entry.favorite);

  return { byProject, byMode, byTopic, byLanguage, byDay, decisions, codeSnippets, highImportance, saved };
}

function renderWeeklySections({ sections, project }) {
  const lines = [];

  lines.push("## Activity Stats", "");
  lines.push(`- Total entries: ${sections.byDay.reduce((sum, [, n]) => sum + n, 0)}`);
  lines.push(`- Projects touched: ${sections.byProject.length || 1}${project !== "all" ? ` (filter: ${project})` : ""}`);
  if (sections.byDay.length) {
    lines.push("- By day:");
    for (const [day, count] of sections.byDay) {
      lines.push(`  - ${dayLabel(day)}: ${count}`);
    }
  } else {
    lines.push("- No entries in this range.");
  }
  if (sections.byProject.length) {
    lines.push("- By project:");
    for (const [name, count] of sections.byProject) {
      lines.push(`  - ${name}: ${count}`);
    }
  }
  if (sections.byMode.length) {
    lines.push("- By mode:");
    for (const [name, count] of sections.byMode) {
      lines.push(`  - ${name}: ${count}`);
    }
  }

  lines.push("", "## Topics", "");
  if (sections.byTopic.length) {
    for (const [topic, count] of sections.byTopic) {
      lines.push(`- ${topic}: ${count}`);
    }
  } else {
    lines.push("- No topic information extracted.");
  }

  if (sections.byLanguage.length) {
    lines.push("", "## Languages", "");
    for (const [language, count] of sections.byLanguage) {
      lines.push(`- ${language}: ${count}`);
    }
  }

  lines.push("", "## Key Decisions", "");
  if (sections.decisions.length) {
    for (const entry of sections.decisions.slice(0, 12)) {
      lines.push(`- ${short(entry.question, 180)}`);
    }
  } else {
    lines.push("- No decisions recorded this week.");
  }

  lines.push("", "## Code Snippets", "");
  if (sections.codeSnippets.length) {
    lines.push(`- ${sections.codeSnippets.length} code snippet${sections.codeSnippets.length === 1 ? "" : "s"} saved.`);
    for (const entry of sections.codeSnippets.slice(0, 8)) {
      const lang = entry.language ? ` (${entry.language})` : "";
      lines.push(`- ${short(entry.question, 160)}${lang}`);
    }
  } else {
    lines.push("- No code snippets saved this week.");
  }

  lines.push("", "## High-Importance Entries", "");
  if (sections.highImportance.length) {
    for (const entry of sections.highImportance.slice(0, 10)) {
      lines.push(`- ${short(entry.question, 180)}`);
    }
  } else {
    lines.push("- No high-importance entries.");
  }

  lines.push("", "## Saved Entries", "");
  if (sections.saved.length) {
    for (const entry of sections.saved.slice(0, 10)) {
      const tags = entry.tags?.length ? ` (${entry.tags.join(", ")})` : "";
      lines.push(`- ${short(entry.question, 180)}${tags}`);
    }
  } else {
    lines.push("- No saved/favorited entries this week.");
  }

  return lines;
}

export function renderWeeklyDigestMarkdown({
  entries,
  weekStart,
  weekEnd,
  project = "all",
  weekStartStamp,
  weekEndStamp,
  isoYear,
  isoWeek,
  llmSummary = null,
  projectLabel = null,
} = {}) {
  const startStamp = weekStartStamp || (weekStart ? isoDateStamp(weekStart) : todayStamp());
  const endStamp = weekEndStamp || (weekEnd ? isoDateStamp(weekEnd) : todayStamp());
  const year = isoYear || new Date(weekStart || Date.now()).getUTCFullYear();
  const week = isoWeek || isoWeekNumber(new Date(weekStart || Date.now())).isoWeek;

  const sections = buildWeeklySections(entries);
  const titleProject = projectLabel || (project === "all" ? "all projects" : project);
  const lines = [
    `# Weekly Digest - ${startStamp} to ${endStamp} (ISO ${year}-W${pad2(week)})`,
    "",
    `Project: ${titleProject}`,
    `Entries: ${entries.length}`,
    `Days covered: ${sections.byDay.length}`,
    "",
  ];

  if (llmSummary) {
    lines.push("## Summary", "", llmSummary, "");
  }

  lines.push(...renderWeeklySections({ sections, project }));
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

export function weeklyFileName({ isoYear, isoWeek } = {}) {
  const now = new Date();
  const { isoYear: y, isoWeek: w } = isoWeek ? { isoYear, isoWeek } : isoWeekNumber(now);
  return `weekly-${y}-W${pad2(w)}.md`;
}

export function writeWeeklyDigest(markdown, { isoYear, isoWeek } = {}, sessionDir = config.sessionDir) {
  fs.mkdirSync(sessionDir, { recursive: true });
  const file = path.join(sessionDir, weeklyFileName({ isoYear, isoWeek }));
  fs.writeFileSync(file, markdown, "utf8");
  return file;
}

const weeklySummarySystemPrompt = `You are a weekly-review summarizer for a developer's personal Q&A scratchpad. Given a structured weekly report (activity stats, topics, decisions, code snippets, high-importance entries, saved entries), produce a 3-5 bullet narrative that:
- Highlights the week's main themes and any momentum (recurring topics, repeated projects)
- Calls out notable decisions and what they imply going forward
- Mentions any code-heavy days or languages that stand out
- Skips filler, marketing language, and emojis
Output ONLY the bullet list, no preamble, no closing line.`;

export async function summarizeWeeklyDigest({
  markdown,
  question,
  sessionContext = [],
} = {}) {
  if (!config.weeklySummaryEnabled) {
    return null;
  }
  if (!markdown) {
    return null;
  }

  const prompt = question || `Summarize the following weekly digest into 3-5 short bullets. Keep the voice neutral and developer-focused.\n\n${markdown}`;

  try {
    const response = await askModel({
      question: prompt,
      modeName: "normal",
      sessionContext,
    });
    const text = String(response?.answer || "").trim();
    return text || null;
  } catch (error) {
    console.error("Weekly summary generation failed:", error.message);
    return null;
  }
}

export const __test__ = { weeklySummarySystemPrompt };
