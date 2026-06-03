#!/usr/bin/env node

import readline from "node:readline/promises";
import { stdin as procStdin, stdout as procStdout } from "node:process";
import { config } from "../src/config.js";
import { refreshIndex } from "../src/logIndex.js";
import {
  describeWeeklyStatus,
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
  saidecar-digest
  saidecar-digest --date YYYY-MM-DD
  saidecar-digest --saved-only
  saidecar-digest --write
  saidecar-digest --dry-run
  saidecar-digest --weekly [--week-of YYYY-MM-DD] [--weeks-ago N] [--summary]

Options:
  --date <date>        Digest a specific date. Default: today.
  --project <name>     Filter by project. Default: current SAIDECAR_PROJECT.
  --saved-only         Digest only saved/favorited entries.
  --write              Save to ${config.sessionDir}/YYYY-MM-DD.md instead of printing only.
  --dry-run            Print selected entry refs without rendering a digest.
  --weekly             Render a weekly digest (Mon-Sun, ISO weeks).
  --week-of <date>     Reference date inside the target week. Default: today.
  --weeks-ago <n>      Pick the week n weeks before the reference (default 0).
  --summary            Ask the active LLM provider for a 3-5 bullet narrative
                       (requires SAIDECAR_WEEKLY_SUMMARY=true or is auto-enabled
                        for this run if you pass --summary explicitly).
  --yes                Auto-accept the weekly-auto prompt (writes the digest).
  --no-weekly-check    Skip the weekly-auto startup check for this run.`);
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

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

const isWeekly = process.argv.includes("--weekly");
const isDryRun = process.argv.includes("--dry-run");
const date = argValue("--date") || todayStamp();
const project = argValue("--project") || config.project;
const savedOnly = process.argv.includes("--saved-only");
const wantsSummary = process.argv.includes("--summary");
const weeksAgo = argInt("--weeks-ago") ?? 0;
const referenceDate = parseDateArg("--week-of");
const forceYes = process.argv.includes("--yes") || process.argv.includes("-y");
const skipWeeklyCheck = process.argv.includes("--no-weekly-check");

refreshIndex();

async function runWeeklyCheck() {
  if (isWeekly || isDryRun || skipWeeklyCheck) {
    return;
  }
  if (!config.weeklyAutoEnabled) {
    return;
  }

  const sessionDir = config.sessionDir;
  const currentRange = isoWeekRange({ referenceDate: new Date() });
  const { status, line } = describeWeeklyStatus({ sessionDir, currentRange });

  if (!status.stale) {
    console.log(line);
    return;
  }

  const currentLabel = `${currentRange.isoYear}-W${pad2(currentRange.isoWeek)}`;
  const isInteractive = Boolean(procStdout.isTTY && procStdin.isTTY);

  if (!isInteractive && !forceYes) {
    console.log(
      `[saidecar-digest] Weekly digest for ${currentLabel} is pending. Re-run interactively or pass --yes to generate.`
    );
    return;
  }

  const lastLabel = status.last
    ? `${status.last.isoYear}-W${pad2(status.last.isoWeek)} (${status.ageDays} day${status.ageDays === 1 ? "" : "s"} ago)`
    : "none yet";
  const question = `[saidecar-digest] Last weekly digest: ${lastLabel}. Generate ${currentLabel} now? [Y/n] `;

  let accepted = false;
  if (forceYes) {
    console.log(`${question.trim()} (auto-yes via --yes)`);
    accepted = true;
  } else {
    const rl = readline.createInterface({
      input: procStdin,
      output: procStdout,
    });
    try {
      const answer = await rl.question(question);
      accepted = !/^n\s*$/i.test(answer.trim());
    } finally {
      rl.close();
    }
  }

  if (!accepted) {
    console.log("[saidecar-digest] Skipped weekly digest generation.");
    return;
  }

  const entries = selectWeeklyEntries({
    weekStart: currentRange.weekStart,
    weekEnd: currentRange.weekEnd,
    project,
    savedOnly,
  });

  let llmSummary = null;
  if (wantsSummary) {
    const baseMarkdown = renderWeeklyDigestMarkdown({
      entries,
      weekStart: currentRange.weekStart,
      weekEnd: currentRange.weekEnd,
      project,
      weekStartStamp: currentRange.weekStartStamp,
      weekEndStamp: currentRange.weekEndStamp,
      isoYear: currentRange.isoYear,
      isoWeek: currentRange.isoWeek,
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
  }

  const markdown = renderWeeklyDigestMarkdown({
    entries,
    weekStart: currentRange.weekStart,
    weekEnd: currentRange.weekEnd,
    project,
    weekStartStamp: currentRange.weekStartStamp,
    weekEndStamp: currentRange.weekEndStamp,
    isoYear: currentRange.isoYear,
    isoWeek: currentRange.isoWeek,
    llmSummary,
  });
  const file = writeWeeklyDigest(markdown, {
    isoYear: currentRange.isoYear,
    isoWeek: currentRange.isoWeek,
  });
  console.log(`[saidecar-digest] Wrote ${file}`);
}

await runWeeklyCheck();

if (isWeekly) {
  const range = isoWeekRange({ referenceDate: referenceDate || new Date(), weeksAgo });
  const entries = selectWeeklyEntries({
    weekStart: range.weekStart,
    weekEnd: range.weekEnd,
    project,
    savedOnly,
  });

  if (isDryRun) {
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
      console.error("[saidecar-digest] Weekly summary requested but LLM did not return a result; printing digest without summary.");
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

if (isDryRun) {
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
