import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { getFilterOptions, refreshIndex, searchEntries } from "./logIndex.js";
import { annotateEntry } from "./annotations.js";
import { wrapText } from "./textUtils.js";
import { blockPatterns, stripInlineMarkdown } from "./markdownUtils.js";
import { APP_DISPLAY_NAME } from "./config.js";

const h = React.createElement;
const dateFilters = ["today", "7d", "30d", "all"];
const importanceFilters = ["all", "high", "medium", "low"];
const focusOrder = ["search", "list", "detail"];
const RESERVED_LAYOUT_ROWS = 8;
const palette = {
  red: "#B65A36",
  gold: "#C8793B",
  amber: "#D39A45",
  straw: "#D8B15A",
  cream: "#F4E7C5",
  slate: "#8A8F98",
  dim: "#626872",
  paper: "#E5E7EB",
  cyan: "#67E8F9",
  blue: "#60A5FA",
  highlightBg: "#D8B15A",
};

export function LogExplorerApp({ initialStats }) {
  const { exit } = useApp();
  const [query, setQuery] = useState("");
  const [modeIndex, setModeIndex] = useState(0);
  const [backendIndex, setBackendIndex] = useState(0);
  const [projectIndex, setProjectIndex] = useState(0);
  const [dateIndex, setDateIndex] = useState(3);
  const [savedOnly, setSavedOnly] = useState(false);
  const [tagIndex, setTagIndex] = useState(0);
  const [importanceIndex, setImportanceIndex] = useState(0);
  const [codeOnly, setCodeOnly] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [detailOffset, setDetailOffset] = useState(0);
  const [focusIndex, setFocusIndex] = useState(0);
  const [stats, setStats] = useState(initialStats);
  const [options, setOptions] = useState({ modes: [], backends: [], projects: [], tags: [] });

  useEffect(() => {
    setOptions(getFilterOptions());
  }, []);

  const modeOptions = useMemo(() => ["all", ...options.modes], [options.modes]);
  const backendOptions = useMemo(() => ["all", ...options.backends], [options.backends]);
  const projectOptions = useMemo(() => ["all", ...options.projects], [options.projects]);
  const tagOptions = useMemo(() => ["all", ...(options.tags || [])], [options.tags]);

  const mode = modeOptions[Math.min(modeIndex, modeOptions.length - 1)] || "all";
  const backend = backendOptions[Math.min(backendIndex, backendOptions.length - 1)] || "all";
  const project = projectOptions[Math.min(projectIndex, projectOptions.length - 1)] || "all";
  const date = dateFilters[dateIndex] || "all";
  const tag = tagOptions[Math.min(tagIndex, tagOptions.length - 1)] || "all";
  const importance = importanceFilters[Math.min(importanceIndex, importanceFilters.length - 1)] || "all";

  const entries = useMemo(
    () =>
      searchEntries({
        query,
        mode,
        backend,
        project,
        date,
        saved: savedOnly,
        tag,
        importance,
        codeOnly,
        limit: 200,
      }),
    [query, mode, backend, project, date, savedOnly, tag, importance, codeOnly]
  );
  const selected = entries[selectedIndex] || entries[0];
  const focus = focusOrder[focusIndex] || "search";
  const contentHeight = Math.max(10, (process.stdout.rows || 32) - RESERVED_LAYOUT_ROWS);
  const highlightTerms = useMemo(() => searchTerms(query), [query]);

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

    if (input === "s") {
      setSavedOnly((value) => !value);
      setSelectedIndex(0);
      return;
    }

    if (input === "g") {
      setTagIndex((value) => (value + 1) % tagOptions.length);
      setSelectedIndex(0);
      return;
    }

    if (input === "i") {
      setImportanceIndex((value) => (value + 1) % importanceFilters.length);
      setSelectedIndex(0);
      return;
    }

    if (input === "n") {
      setCodeOnly((value) => !value);
      setSelectedIndex(0);
      return;
    }

    if (input === "f" && selected) {
      annotateEntry(selected, { favorite: true });
      setOptions(getFilterOptions());
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
    { flexDirection: "column" },
    h(Header, { query, mode, backend, project, date, savedOnly, tag, importance, codeOnly, focus, stats }),
    h(
      Box,
      { flexDirection: "row", flexGrow: 1 },
      h(ResultList, { entries, selectedIndex, focus, contentHeight, highlightTerms }),
      h(DetailPane, { entry: selected, detailOffset, focus, contentHeight, highlightTerms })
    ),
    h(Footer)
  );
}

function Header({ query, mode, backend, project, date, savedOnly, tag, importance, codeOnly, focus, stats }) {
  return h(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    h(Text, { color: palette.gold, bold: true }, `${APP_DISPLAY_NAME} Log Explorer`),
    h(
      Text,
      null,
      h(Text, { color: focus === "search" ? palette.straw : palette.slate }, "search "),
      h(Text, null, query || "recent"),
      h(Text, { color: palette.slate }, `  mode=${mode} backend=${backend} project=${project} date=${date} saved=${savedOnly ? "yes" : "no"} tag=${tag} importance=${importance} code=${codeOnly ? "yes" : "no"}`)
    ),
    h(
      Text,
      { color: stats?.malformedLines ? palette.amber : palette.slate },
      `index: ${stats?.indexedEntries || 0} entries refreshed, ${stats?.skippedFiles || 0} files skipped, ${stats?.malformedLines || 0} malformed`
    )
  );
}

function ResultList({ entries, selectedIndex, focus, contentHeight, highlightTerms }) {
  const visible = entries.slice(0, Math.max(1, contentHeight - 2));

  return h(
    Box,
    {
      flexDirection: "column",
      width: "50%",
      height: contentHeight,
      borderStyle: "round",
      borderColor: focus === "list" ? palette.gold : palette.dim,
      paddingX: 1,
    },
    h(Text, { color: palette.slate }, `${entries.length} result${entries.length === 1 ? "" : "s"}`),
    ...visible.map((entry, index) => {
      const selected = index === selectedIndex;
      return renderHighlightedText({
        key: entry.id,
        text: `${entry.favorite ? "*" : " "} ${entry.ref} ${formatDate(entry.timestamp)} [${entry.mode || "-"}]${entry.isCodeSnippet ? " <>" : "   "}${entry.importance ? importanceBadge(entry.importance) : "  "} ${truncate(entry.question || "(no question)", 44)}`,
        terms: highlightTerms,
        color: selected ? "black" : modeColorName(entry.mode),
        backgroundColor: selected ? palette.straw : undefined,
        highlightColor: "black",
        highlightBackgroundColor: selected ? palette.cream : palette.highlightBg,
      });
    })
  );
}

function DetailPane({ entry, detailOffset, focus, contentHeight, highlightTerms }) {
  if (!entry) {
    return h(
      Box,
      {
        flexDirection: "column",
        width: "50%",
        height: contentHeight,
        borderStyle: "round",
        borderColor: focus === "detail" ? palette.gold : palette.dim,
        paddingX: 1,
      },
      h(Text, { color: palette.slate }, "No entries found.")
    );
  }

  const lines = detailLines(entry).slice(detailOffset, detailOffset + Math.max(1, contentHeight - 2));

  return h(
    Box,
    {
      flexDirection: "column",
      width: "50%",
      height: contentHeight,
      borderStyle: "round",
      borderColor: focus === "detail" ? palette.gold : palette.dim,
      paddingX: 1,
    },
    ...lines.map((line, index) =>
      renderDetailLine(line, `${entry.id}-${detailOffset}-${index}`, highlightTerms)
    )
  );
}

function Footer() {
  return h(
    Box,
    null,
    h(
      Text,
      { color: palette.slate },
      "type search | up/down select | enter detail | tab focus | m/b/p/d filters | s saved | g tag | i importance | n code | f favorite | r reindex | q quit"
    )
  );
}

function detailLines(entry) {
  const sources = entry.sources || [];
  const metadata = [
    `${entry.timestamp || "-"}  ${entry.project || "-"}  ${entry.backend || "-"}  ${entry.model || "-"}`,
    `ref: ${entry.ref}`,
    `log: ${entry.logFile}:${entry.lineNumber}`,
    `saved: ${entry.favorite ? "yes" : "no"}  tags: ${entry.tags?.length ? entry.tags.join(", ") : "-"}`,
  ];

  return [
    { color: palette.straw, bold: true, text: "Question" },
    ...wrapForDetail(entry.question || "(no question)").map((text) => ({ color: palette.paper, text })),
    { color: palette.gold, text: "" },
    { color: palette.gold, bold: true, text: "Answer" },
    ...markdownDetailLines(entry.answer || "(no answer)"),
    ...(sources.length
      ? [
          { color: palette.cyan, text: "" },
          { color: palette.cyan, bold: true, text: "Sources" },
          ...sources.map((source, index) => ({
            color: palette.blue,
            text: `${index + 1}. ${source.title || source.url}: ${source.url}`,
          })),
        ]
      : []),
    { color: palette.slate, text: "" },
    ...metadata.map((text) => ({ color: palette.slate, text })),
  ];
}

export function markdownDetailLines(markdown) {
  if (markdown == null || markdown === "") {
    return [];
  }
  const rendered = [];
  let inFence = false;

  for (const rawLine of String(markdown).split(/\r?\n/)) {
    const fence = blockPatterns.fence.exec(rawLine);
    if (fence) {
      inFence = !inFence;
      if (inFence) {
        rendered.push({
          color: palette.slate,
          text: fence[3].trim() || "code",
        });
      }
      continue;
    }

    if (inFence) {
      rendered.push(...wrapForDetail(rawLine).map((text) => ({ color: palette.straw, text })));
      continue;
    }

    if (blockPatterns.horizontalRule.test(rawLine)) {
      rendered.push({ color: palette.slate, text: "─".repeat(8) });
      continue;
    }

    for (const text of wrapForDetail(rawLine)) {
      rendered.push(markdownLine(text));
    }
  }

  return rendered;
}

function markdownLine(line) {
  const heading = blockPatterns.heading.exec(line);
  if (heading) {
    return { color: palette.gold, bold: true, text: stripInlineMarkdown(heading[2]) };
  }

  const blockquote = blockPatterns.blockquote.exec(line);
  if (blockquote) {
    return { color: palette.cyan, text: `${blockquote[1]}| ${stripInlineMarkdown(blockquote[2])}` };
  }

  const task = blockPatterns.task.exec(line);
  if (task) {
    return {
      color: palette.paper,
      text: `${task[1]}${task[2].trim() ? "[x]" : "[ ]"} ${stripInlineMarkdown(task[3])}`,
    };
  }

  const unordered = blockPatterns.unordered.exec(line);
  if (unordered) {
    return { color: palette.paper, text: `${unordered[1]}- ${stripInlineMarkdown(unordered[3])}` };
  }

  const ordered = blockPatterns.ordered.exec(line);
  if (ordered) {
    return { color: palette.paper, text: `${ordered[1]}${ordered[2]}. ${stripInlineMarkdown(ordered[3])}` };
  }

  const tableSeparator = blockPatterns.tableSeparator.test(line);
  if (tableSeparator) {
    return { color: palette.slate, text: line };
  }

  return { color: palette.paper, text: stripInlineMarkdown(line) };
}

function renderDetailLine(line, key, highlightTerms) {
  return renderHighlightedText({
    key,
    text: line.text,
    terms: highlightTerms,
    color: line.color,
    bold: line.bold || false,
  });
}

export function searchTerms(query) {
  return [
    ...new Set(
      String(query || "")
        .trim()
        .split(/\s+/)
        .map((term) => term.replace(/^"+|"+$/g, "").toLowerCase())
        .filter((term) => term.length >= 2)
    ),
  ];
}

export function splitHighlightedText(text, terms) {
  const source = String(text || "");
  const activeTerms = [...terms].filter(Boolean).sort((a, b) => b.length - a.length);

  if (!activeTerms.length || !source) {
    return [{ text: source, highlight: false }];
  }

  const lower = source.toLowerCase();
  const ranges = [];

  for (let index = 0; index < source.length; index += 1) {
    const term = activeTerms.find((candidate) => lower.startsWith(candidate, index));
    if (!term) {
      continue;
    }

    ranges.push([index, index + term.length]);
    index += term.length - 1;
  }

  if (!ranges.length) {
    return [{ text: source, highlight: false }];
  }

  const segments = [];
  let cursor = 0;

  for (const [start, end] of ranges) {
    if (start > cursor) {
      segments.push({ text: source.slice(cursor, start), highlight: false });
    }
    segments.push({ text: source.slice(start, end), highlight: true });
    cursor = end;
  }

  if (cursor < source.length) {
    segments.push({ text: source.slice(cursor), highlight: false });
  }

  return segments;
}

function renderHighlightedText({
  key,
  text,
  terms,
  color,
  backgroundColor,
  bold = false,
  highlightColor = "black",
  highlightBackgroundColor = palette.highlightBg,
}) {
  const segments = splitHighlightedText(text, terms);

  return h(
    Text,
    {
      key,
      color,
      backgroundColor,
      bold,
    },
    ...segments.map((segment, index) =>
      h(
        Text,
        {
          key: `${key}-${index}`,
          color: segment.highlight ? highlightColor : color,
          backgroundColor: segment.highlight ? highlightBackgroundColor : backgroundColor,
          bold: segment.highlight || bold,
        },
        segment.text
      )
    )
  );
}

function wrapForDetail(text) {
  const width = Math.max(40, Math.min(process.stdout.columns || 100, 120) - 48);
  return wrapText(text, width);
}

function modeColorName(mode) {
  if (mode === "think") return palette.gold;
  if (mode === "web") return palette.blue;
  if (mode === "deepweb") return palette.cyan;
  return palette.straw;
}

function importanceBadge(importance) {
  if (importance === "high") return "!!";
  if (importance === "medium") return "! ";
  if (importance === "low") return "  ";
  return "  ";
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
