import { APP_DISPLAY_NAME } from "./config.js";

function truncate(text, maxLength = 260) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

export function formatEntriesText(entries) {
  const lines = [`${entries.length} result${entries.length === 1 ? "" : "s"}`];

  for (const entry of entries) {
    const marker = entry.favorite ? " *" : "";
    const tags = entry.tags?.length ? ` #${entry.tags.join(" #")}` : "";
    lines.push(
      `${entry.timestamp || "-"} [${entry.mode || "-"}] ${entry.ref}${marker}${tags} ${entry.question || "(no question)"}`
    );
  }

  return `${lines.join("\n")}\n`;
}

export function formatEntriesMarkdown(entries) {
  const lines = [
    `# ${APP_DISPLAY_NAME} Log Export`,
    "",
    `${entries.length} result${entries.length === 1 ? "" : "s"}`,
    "",
  ];

  for (const entry of entries) {
    const tags = entry.tags?.length ? ` | tags: ${entry.tags.join(", ")}` : "";
    const favorite = entry.favorite ? " | favorite" : "";
    lines.push(`## ${entry.timestamp || "-"} [${entry.mode || "-"}]`);
    lines.push("");
    lines.push(`Ref: \`${entry.ref}\`${favorite}${tags}`);
    lines.push("");
    lines.push("**Question**");
    lines.push("");
    lines.push(entry.question || "(no question)");
    lines.push("");
    lines.push("**Answer**");
    lines.push("");
    lines.push(truncate(entry.answer || "(no answer)", 1600));

    if (entry.sources?.length) {
      lines.push("");
      lines.push("**Sources**");
      lines.push("");
      for (const source of entry.sources) {
        lines.push(`- [${source.title || source.url}](${source.url})`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}
