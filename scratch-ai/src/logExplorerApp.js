import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { getFilterOptions, refreshIndex, searchEntries } from "./logIndex.js";
import { config } from "./config.js";

const h = React.createElement;
const dateFilters = ["today", "7d", "30d", "all"];
const focusOrder = ["search", "list", "detail"];

export function LogExplorerApp({ initialStats }) {
  const { exit } = useApp();
  const [query, setQuery] = useState("");
  const [modeIndex, setModeIndex] = useState(0);
  const [backendIndex, setBackendIndex] = useState(0);
  const [projectIndex, setProjectIndex] = useState(0);
  const [dateIndex, setDateIndex] = useState(3);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [detailOffset, setDetailOffset] = useState(0);
  const [focusIndex, setFocusIndex] = useState(0);
  const [stats, setStats] = useState(initialStats);
  const [options, setOptions] = useState(() => getFilterOptions());

  const modeOptions = useMemo(() => ["all", ...options.modes], [options.modes]);
  const backendOptions = useMemo(() => ["all", ...options.backends], [options.backends]);
  const projectOptions = useMemo(() => ["all", ...options.projects], [options.projects]);

  const mode = modeOptions[Math.min(modeIndex, modeOptions.length - 1)] || "all";
  const backend = backendOptions[Math.min(backendIndex, backendOptions.length - 1)] || "all";
  const project = projectOptions[Math.min(projectIndex, projectOptions.length - 1)] || "all";
  const date = dateFilters[dateIndex] || "all";

  const entries = useMemo(
    () =>
      searchEntries({
        query,
        mode,
        backend,
        project,
        date,
        limit: 200,
      }),
    [query, mode, backend, project, date]
  );
  const selected = entries[selectedIndex] || entries[0];
  const focus = focusOrder[focusIndex] || "search";

  useEffect(() => {
    if (selectedIndex >= entries.length) {
      setSelectedIndex(Math.max(0, entries.length - 1));
    }
    setDetailOffset(0);
  }, [entries.length, selectedIndex]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    if (key.tab) {
      setFocusIndex((value) => (value + 1) % focusOrder.length);
      return;
    }

    if (key.upArrow) {
      if (focus === "detail") {
        setDetailOffset((value) => Math.max(0, value - 1));
      } else {
        setSelectedIndex((value) => Math.max(0, value - 1));
      }
      return;
    }

    if (key.downArrow) {
      if (focus === "detail") {
        setDetailOffset((value) => value + 1);
      } else {
        setSelectedIndex((value) => Math.min(entries.length - 1, value + 1));
      }
      return;
    }

    if (key.return) {
      setFocusIndex(2);
      return;
    }

    if (key.backspace || key.delete) {
      if (focus === "search") {
        setQuery((value) => value.slice(0, -1));
        setSelectedIndex(0);
      }
      return;
    }

    if (focus === "search" && input && !key.ctrl && !key.meta) {
      setQuery((value) => value + input);
      setSelectedIndex(0);
      return;
    }

    if (input === "q") {
      exit();
      return;
    }

    if (input === "m") {
      setModeIndex((value) => (value + 1) % modeOptions.length);
      setSelectedIndex(0);
      return;
    }

    if (input === "b") {
      setBackendIndex((value) => (value + 1) % backendOptions.length);
      setSelectedIndex(0);
      return;
    }

    if (input === "p") {
      setProjectIndex((value) => (value + 1) % projectOptions.length);
      setSelectedIndex(0);
      return;
    }

    if (input === "d") {
      setDateIndex((value) => (value + 1) % dateFilters.length);
      setSelectedIndex(0);
      return;
    }

    if (input === "r") {
      const nextStats = refreshIndex();
      setStats(nextStats);
      setOptions(getFilterOptions());
      setSelectedIndex(0);
      return;
    }

  });

  return h(
    Box,
    { flexDirection: "column", paddingX: 1 },
    h(Header, { query, mode, backend, project, date, focus, stats }),
    h(
      Box,
      { flexDirection: "row", flexGrow: 1 },
      h(ResultList, { entries, selectedIndex, focus }),
      h(DetailPane, { entry: selected, detailOffset, focus })
    ),
    h(Footer)
  );
}

function Header({ query, mode, backend, project, date, focus, stats }) {
  return h(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    h(Text, { color: "magentaBright", bold: true }, "Scratch AI Log Explorer"),
    h(
      Text,
      null,
      h(Text, { color: focus === "search" ? "greenBright" : "gray" }, "search "),
      h(Text, null, query || "recent"),
      h(Text, { color: "gray" }, `  mode=${mode} backend=${backend} project=${project} date=${date}`)
    ),
    h(
      Text,
      { color: stats?.malformedLines ? "yellow" : "gray" },
      `index: ${stats?.indexedEntries || 0} entries refreshed, ${stats?.skippedFiles || 0} files skipped, ${stats?.malformedLines || 0} malformed`
    )
  );
}

function ResultList({ entries, selectedIndex, focus }) {
  const visible = entries.slice(0, 18);

  return h(
    Box,
    {
      flexDirection: "column",
      width: "42%",
      borderStyle: "round",
      borderColor: focus === "list" ? "greenBright" : "gray",
      paddingX: 1,
      marginRight: 1,
    },
    h(Text, { color: "gray" }, `${entries.length} result${entries.length === 1 ? "" : "s"}`),
    ...visible.map((entry, index) =>
      h(
        Text,
        {
          key: entry.id,
          color: index === selectedIndex ? "black" : modeColorName(entry.mode),
          backgroundColor: index === selectedIndex ? "greenBright" : undefined,
        },
        `${formatDate(entry.timestamp)} [${entry.mode || "-"}] ${truncate(entry.question || "(no question)", 58)}`
      )
    )
  );
}

function DetailPane({ entry, detailOffset, focus }) {
  if (!entry) {
    return h(
      Box,
      {
        flexDirection: "column",
        flexGrow: 1,
        borderStyle: "round",
        borderColor: focus === "detail" ? "magentaBright" : "gray",
        paddingX: 1,
      },
      h(Text, { color: "gray" }, "No entries found.")
    );
  }

  const lines = detailLines(entry).slice(detailOffset, detailOffset + 28);

  return h(
    Box,
    {
      flexDirection: "column",
      flexGrow: 1,
      borderStyle: "round",
      borderColor: focus === "detail" ? "magentaBright" : "gray",
      paddingX: 1,
    },
    ...lines.map((line, index) =>
      h(Text, { key: `${entry.id}-${detailOffset}-${index}`, color: line.color }, line.text)
    )
  );
}

function Footer() {
  return h(
    Box,
    { marginTop: 1 },
    h(
      Text,
      { color: "gray" },
      "type search | up/down select | enter detail | tab focus | list/detail: m/b/p/d filters, r reindex, q quit | ctrl+c quit"
    )
  );
}

function detailLines(entry) {
  const sources = entry.sources || [];
  const metadata = [
    `${entry.timestamp || "-"}  ${entry.project || "-"}  ${entry.backend || "-"}  ${entry.model || "-"}`,
    `log: ${entry.logFile}:${entry.lineNumber}`,
  ];

  return [
    { color: "greenBright", text: "Question" },
    ...wrapForDetail(entry.question || "(no question)").map((text) => ({ color: "white", text })),
    { color: "magentaBright", text: "" },
    { color: "magentaBright", text: "Answer" },
    ...wrapForDetail(entry.answer || "(no answer)").map((text) => ({ color: "white", text })),
    ...(sources.length
      ? [
          { color: "cyanBright", text: "" },
          { color: "cyanBright", text: "Sources" },
          ...sources.map((source, index) => ({
            color: "cyan",
            text: `${index + 1}. ${source.title || source.url}: ${source.url}`,
          })),
        ]
      : []),
    { color: "gray", text: "" },
    ...metadata.map((text) => ({ color: "gray", text })),
  ];
}

function wrapForDetail(text) {
  const width = Math.max(40, Math.min(process.stdout.columns || 100, 120) - 48);
  const lines = [];

  for (const rawLine of text.split(/\r?\n/)) {
    let line = "";
    const words = rawLine.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      lines.push("");
      continue;
    }

    for (const word of words) {
      if (!line) {
        line = word;
      } else if ((line + " " + word).length <= width) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }

    if (line) {
      lines.push(line);
    }
  }

  return lines;
}

function modeColorName(mode) {
  if (mode === "think") return "magentaBright";
  if (mode === "web") return "blueBright";
  if (mode === "deepweb") return "cyanBright";
  return "greenBright";
}

function formatDate(timestamp) {
  if (!timestamp) return "---- --:--";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp.slice(0, 10);

  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function truncate(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}
