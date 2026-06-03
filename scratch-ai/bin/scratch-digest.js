#!/usr/bin/env node

import { config } from "../src/config.js";
import { refreshIndex } from "../src/logIndex.js";
import {
  isoWeekRange,
  renderDigestMarkdown,
  renderWeeklyDigestMarkdown,
  selectDigestEntries,
  selectWeeklyEntries,
  summarizeWeeklyDigest,
  writeDigest,
  writeWeeklyDigest,
} from "../src/digest.js";

function printHelp() {
  console.log(`Usage:
  scratch-digest
  scratch-digest --date YYYY-MM-DD
  scratch-digest --saved-only
  scratch-digest --write
  scratch-digest --dry-run
  scratch-digest --weekly [--week-of YYYY-MM-DD] [--weeks-ago N] [--summary]

Options:
  --date <date>      Digest a specific date. Default: today.
  --project <name>   Filter by project. Default: current SCRATCH_AI_PROJECT.
  --saved-only       Digest only saved/favorited entries.
  --write            Save to ${config.sessionDir}/YYYY-MM-DD.md instead of printing only.
  --dry-run          Print selected entry refs without rendering a digest.
  --weekly           Render a weekly digest (Mon-Sun, ISO weeks).
  --week-of <date>   Reference date inside the target week. Default: today.
  --weeks-ago <n>    Pick the week n weeks before the reference (default 0).
  --summary          Ask the active LLM provider for a 3-5 bullet narrative
                     (requires SCRATCH_AI_WEEKLY_SUMMARY=true or is auto-enabled
                      for this run if you pass --summary explicitly).`);
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function argInt(name) {
  const raw = argValue(name);
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseDateArg(name) {
  const raw = argValue(name);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

const isWeekly = process.argv.includes("--weekly");
const date = argValue("--date") || todayStamp();
const project = argValue("--project") || config.project;
const savedOnly = process.argv.includes("--saved-only");
const wantsSummary = process.argv.includes("--summary");
const weeksAgo = argInt("--weeks-ago") ?? 0;
const referenceDate = parseDateArg("--week-of");

refreshIndex();

if (isWeekly) {
  const range = isoWeekRange({ referenceDate: referenceDate || new Date(), weeksAgo });
  const entries = selectWeeklyEntries({
    weekStart: range.weekStart,
    weekEnd: range.weekEnd,
    project,
    savedOnly,
  });

  if (process.argv.includes("--dry-run")) {
    for (const entry of entries) {
      console.log(`${entry.ref} ${entry.favorite ? "*" : " "} ${entry.question || "(no question)"}`);
    }
    process.exit(0);
  }

  let llmSummary = null;
  if (wantsSummary) {
    const baseMarkdown = renderWeeklyDigestMarkdown({
      entries,
      weekStart: range.weekStart,
      weekEnd: range.weekEnd,
      project,
      weekStartStamp: range.weekStartStamp,
      weekEndStamp: range.weekEndStamp,
      isoYear: range.isoYear,
      isoWeek: range.isoWeek,
    });
    const previousEnabled = config.weeklySummaryEnabled;
    if (!previousEnabled) {
      config.weeklySummaryEnabled = true;
    }
    try {
      llmSummary = await summarizeWeeklyDigest({ markdown: baseMarkdown });
    } finally {
      config.weeklySummaryEnabled = previousEnabled;
    }
    if (!llmSummary) {
      console.error("[scratch-digest] Weekly summary requested but LLM did not return a result; printing digest without summary.");
    }
  }

  const markdown = renderWeeklyDigestMarkdown({
    entries,
    weekStart: range.weekStart,
    weekEnd: range.weekEnd,
    project,
    weekStartStamp: range.weekStartStamp,
    weekEndStamp: range.weekEndStamp,
    isoYear: range.isoYear,
    isoWeek: range.isoWeek,
    llmSummary,
  });

  if (process.argv.includes("--write")) {
    const file = writeWeeklyDigest(markdown, { isoYear: range.isoYear, isoWeek: range.isoWeek });
    console.log(`Wrote ${file}`);
  } else {
    process.stdout.write(markdown);
  }
  process.exit(0);
}

const entries = selectDigestEntries({ date, project, savedOnly });

if (process.argv.includes("--dry-run")) {
  for (const entry of entries) {
    console.log(`${entry.ref} ${entry.favorite ? "*" : " "} ${entry.question || "(no question)"}`);
  }
  process.exit(0);
}

const markdown = renderDigestMarkdown({ entries, date, project });

if (process.argv.includes("--write")) {
  const file = writeDigest(markdown, date);
  console.log(`Wrote ${file}`);
} else {
  process.stdout.write(markdown);
}
