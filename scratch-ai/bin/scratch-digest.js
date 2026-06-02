#!/usr/bin/env node

import { config } from "../src/config.js";
import { refreshIndex } from "../src/logIndex.js";
import { renderDigestMarkdown, selectDigestEntries, writeDigest } from "../src/digest.js";

function printHelp() {
  console.log(`Usage:
  scratch-digest
  scratch-digest --date YYYY-MM-DD
  scratch-digest --saved-only
  scratch-digest --write
  scratch-digest --dry-run

Options:
  --date <date>     Digest a specific date. Default: today.
  --project <name>  Filter by project. Default: current SCRATCH_AI_PROJECT.
  --saved-only      Digest only saved/favorited entries.
  --write           Save to ${config.sessionDir}/YYYY-MM-DD.md instead of printing only.
  --dry-run         Print selected entry refs without rendering a digest.`);
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

const date = argValue("--date") || todayStamp();
const project = argValue("--project") || config.project;
const savedOnly = process.argv.includes("--saved-only");

refreshIndex();
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
