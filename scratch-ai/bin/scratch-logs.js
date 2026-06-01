#!/usr/bin/env node

import React from "react";
import { render } from "ink";
import { LogExplorerApp } from "../src/logExplorerApp.js";
import { refreshIndex, searchEntries } from "../src/logIndex.js";
import { config } from "../src/config.js";

function printHelp() {
  console.log(`Usage:
  scratch-logs
  scratch-logs --query <text>
  scratch-logs --help

Options:
  --query <text>   Run a non-interactive search and print matching entries.
  --limit <n>      Limit non-interactive results. Default: 20.
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

if (query !== undefined) {
  const limit = Number.parseInt(argValue("--limit") || "20", 10);
  const entries = searchEntries({ query, limit });
  console.log(`${entries.length} result${entries.length === 1 ? "" : "s"}`);

  for (const entry of entries) {
    console.log(
      `${entry.timestamp || "-"} [${entry.mode || "-"}] ${entry.question || "(no question)"}`
    );
  }

  if (stats.malformedLines > 0) {
    console.error(`Warnings: ${stats.malformedLines} malformed JSONL line(s).`);
  }

  process.exit(0);
}

render(React.createElement(LogExplorerApp, { initialStats: stats }));
