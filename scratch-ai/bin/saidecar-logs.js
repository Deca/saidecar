#!/usr/bin/env node

import React from "react";
import { render } from "ink";
import { LogExplorerApp } from "../src/logExplorerApp.js";
import { refreshIndex, searchEntries } from "../src/logIndex.js";
import { config } from "../src/config.js";
import { formatEntriesMarkdown, formatEntriesText } from "../src/logExport.js";

function printHelp() {
  console.log(`Usage:
  scratch-logs
  scratch-logs --query <text>
  scratch-logs --query <text> --format markdown
  scratch-logs --date today|7d|30d|all --format markdown
  scratch-logs --help

Options:
  --query <text>   Run a non-interactive search and print matching entries.
  --limit <n>      Limit non-interactive results. Default: 20.
  --date <range>   Filter results by today, 7d, 30d, or all.
  --saved          Show only saved/favorited entries.
  --tag <tag>      Show only entries with a tag.
  --format <name>  text or markdown. Default: text.
  --reindex        Refresh the index before returning.

Environment:
  SCRATCH_AI_LOG_DIR=${config.logDir}
  SCRATCH_AI_INDEX_PATH=${config.indexPath}`);
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

const stats = refreshIndex();
const query = argValue("--query");
const format = argValue("--format") || "text";
const date = argValue("--date") || "all";
const saved = process.argv.includes("--saved");
const tag = argValue("--tag") || "all";

if (query !== undefined || process.argv.includes("--date") || saved || tag !== "all") {
  const limit = Number.parseInt(argValue("--limit") || "20", 10);
  const entries = searchEntries({ query: query || "", date, saved, tag, limit });
  process.stdout.write(format === "markdown" ? formatEntriesMarkdown(entries) : formatEntriesText(entries));

  if (stats.malformedLines > 0) {
    console.error(`Warnings: ${stats.malformedLines} malformed JSONL line(s).`);
  }

  process.exit(0);
}

render(React.createElement(LogExplorerApp, { initialStats: stats }));
